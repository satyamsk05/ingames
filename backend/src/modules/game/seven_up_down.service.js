const db = require('../../config/db');
const LedgerService = require('../wallet/ledger.service');
const crypto = require('crypto');

class SevenUpDownService {
  static currentRound = null;
  static roundTimer = null;
  static ioInstance = null;

  static setSocketIO(io) {
    this.ioInstance = io;
  }

  /**
   * Deterministic HMAC-SHA256 Provably Fair Dice Derivation
   */
  static deriveDice({ serverSeed, roundId, roundNumber }) {
    const message = `${roundId}:${roundNumber}:0`;
    const digest = crypto
      .createHmac('sha256', serverSeed)
      .update(message)
      .digest('hex');

    return {
      dice1: (parseInt(digest.slice(0, 8), 16) % 6) + 1,
      dice2: (parseInt(digest.slice(8, 16), 16) % 6) + 1,
    };
  }

  /**
   * Get recent finished round history (last N results)
   */
  static getRecentHistory(limit = 50) {
    try {
      const rows = db.prepare(`
        SELECT result_sum FROM game_rounds
        WHERE game_id = 'game_7_up_down' AND status = 'FINISHED' AND result_sum IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
      return rows.map(r => r.result_sum);
    } catch (_) {
      return [];
    }
  }

  /**
   * Get active/current game round with automatic timer scheduling
   */
  static getCurrentRound() {
    const dbRound = db.prepare(`
      SELECT * FROM game_rounds 
      WHERE game_id = 'game_7_up_down' AND status IN ('BETTING_OPEN', 'BETTING_CLOSED', 'RESULT_GENERATED')
      ORDER BY created_at DESC LIMIT 1
    `).get();

    if (dbRound) {
      const closeAt = new Date(dbRound.betting_close_at).getTime();
      const remainingMs = closeAt - Date.now();

      if (dbRound.status === 'BETTING_OPEN') {
        if (remainingMs > 0) {
          if (!this.currentRound || this.currentRound.id !== dbRound.id || !this.roundTimer) {
            this.currentRound = dbRound;
            clearTimeout(this.roundTimer);
            this.roundTimer = setTimeout(() => this.closeBettingAndRoll(dbRound.id), remainingMs);
          }
        } else {
          this.closeBettingAndRoll(dbRound.id);
        }
      } else {
        if (remainingMs < -10000) {
          db.prepare(`UPDATE game_rounds SET status = 'FINISHED' WHERE id = ?`).run(dbRound.id);
          return this.createNewRound();
        }
        this.currentRound = dbRound;
      }
      return this.currentRound;
    }

    // Mark old stuck rounds as finished before creating a clean round
    db.prepare(`
      UPDATE game_rounds 
      SET status = 'FINISHED' 
      WHERE game_id = 'game_7_up_down' AND status IN ('BETTING_OPEN', 'BETTING_CLOSED', 'RESULT_GENERATED')
    `).run();
    this.currentRound = this.createNewRound();
    return this.currentRound;
  }

  /**
   * Create new round with provably fair seed commitment
   */
  static createNewRound() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const seedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');

    const lastRound = db.prepare(`
      SELECT round_number FROM game_rounds WHERE game_id = 'game_7_up_down' ORDER BY round_number DESC LIMIT 1
    `).get();
    const nextRoundNumber = lastRound ? lastRound.round_number + 1 : 1001;

    const roundId = 'rnd_' + crypto.randomUUID().slice(0, 12);
    const now = new Date();
    const bettingOpenAt = now.toISOString();
    const bettingCloseAt = new Date(now.getTime() + 15000).toISOString(); // 15 seconds betting window

    db.prepare(`
      INSERT INTO game_rounds 
      (id, game_id, round_number, status, server_seed, seed_hash, fairness_version, betting_open_at, betting_close_at, created_at)
      VALUES (?, 'game_7_up_down', ?, 'BETTING_OPEN', ?, ?, 1, ?, ?, ?)
    `).run(roundId, nextRoundNumber, serverSeed, seedHash, bettingOpenAt, bettingCloseAt, bettingOpenAt);

    const round = db.prepare('SELECT * FROM game_rounds WHERE id = ?').get(roundId);
    this.currentRound = round;

    if (this.ioInstance) {
      this.ioInstance.emit('ROUND_CREATED', {
        roundId: round.id,
        roundNumber: round.round_number,
        seedHash: round.seed_hash,
        fairnessVersion: 1,
        bettingCloseAt: round.betting_close_at,
        timeRemainingSeconds: 15,
        recentHistory: this.getRecentHistory(50),
      });
    }

    // Schedule round progression
    clearTimeout(this.roundTimer);
    this.roundTimer = setTimeout(() => this.closeBettingAndRoll(round.id), 15000);

    return round;
  }

  /**
   * Place bet on active round with server validation
   */
  static placeBet({ userId, roundId, betType, stakeAmountPaise, idempotencyKey }) {
    const round = this.getCurrentRound();
    if (round.id !== roundId) {
      throw new Error('ROUND_EXPIRED');
    }

    if (round.status !== 'BETTING_OPEN') {
      throw new Error('BETTING_CLOSED');
    }

    const now = new Date().toISOString();
    if (now > round.betting_close_at) {
      throw new Error('BETTING_CLOSED');
    }

    const normalizedBetType = betType.toUpperCase().trim();
    const validMainTypes = ['DOWN', 'UP', 'SEVEN'];
    const validNumberTypes = ['2', '3', '4', '5', '6', '8', '9', '10', '11', '12'];
    
    if (!validMainTypes.includes(normalizedBetType) && !validNumberTypes.includes(normalizedBetType)) {
      throw new Error('INVALID_BET_TYPE');
    }

    if (stakeAmountPaise < 1000) { // Min ₹10
      throw new Error('MIN_BET_AMOUNT_RS_10');
    }

    const betId = 'bet_' + crypto.randomUUID().slice(0, 12);
    const betTitle = `7 Up Down : ${normalizedBetType}`;

    const executePlaceBet = db.transaction(() => {
      // Deduct stake using ledger engine (atomic)
      const walletSummary = LedgerService.deductBetStake({
        userId,
        stakePaise: stakeAmountPaise,
        referenceId: betId,
        betTitle,
        idempotencyKey,
      });

      db.prepare(`
        INSERT INTO bets (id, user_id, game_id, round_id, bet_type, stake_amount_paise, status, payout_amount_paise, idempotency_key, created_at, updated_at)
        VALUES (?, ?, 'game_7_up_down', ?, ?, ?, 'ACCEPTED', 0, ?, ?, ?)
      `).run(betId, userId, roundId, normalizedBetType, stakeAmountPaise, idempotencyKey, now, now);

      const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);
      return { walletSummary, bet };
    });

    const { walletSummary, bet } = executePlaceBet();

    if (this.ioInstance) {
      this.ioInstance.to(`user_${userId}`).emit('WALLET_UPDATED', walletSummary);
    }

    return {
      betId: bet.id,
      roundId: round.id,
      betType: bet.bet_type,
      stakeAmount: bet.stake_amount_paise / 100,
      status: bet.status,
      wallet: walletSummary,
    };
  }

  /**
   * Close betting and roll dice using HMAC-SHA256 provably fair derivation
   */
  static closeBettingAndRoll(roundId) {
    const round = db.prepare('SELECT * FROM game_rounds WHERE id = ?').get(roundId);
    if (!round || round.status !== 'BETTING_OPEN') return;

    db.prepare(`UPDATE game_rounds SET status = 'BETTING_CLOSED' WHERE id = ?`).run(roundId);

    if (this.ioInstance) {
      this.ioInstance.emit('BETTING_CLOSED', { roundId, message: 'No more bets!' });
    }

    setTimeout(() => {
      // Deterministic provably fair dice calculation
      const { dice1, dice2 } = this.deriveDice({
        serverSeed: round.server_seed,
        roundId: round.id,
        roundNumber: round.round_number,
      });

      const sum = dice1 + dice2;
      const closedAt = new Date().toISOString();

      db.prepare(`
        UPDATE game_rounds 
        SET status = 'RESULT_GENERATED', result_dice_1 = ?, result_dice_2 = ?, result_sum = ?, closed_at = ?
        WHERE id = ?
      `).run(dice1, dice2, sum, closedAt, roundId);

      const updatedRound = db.prepare('SELECT * FROM game_rounds WHERE id = ?').get(roundId);

      let winningOutcome = 'SEVEN';
      if (sum < 7) winningOutcome = 'DOWN';
      else if (sum > 7) winningOutcome = 'UP';

      if (this.ioInstance) {
        this.ioInstance.emit('ROUND_RESULT', {
          roundId,
          roundNumber: updatedRound.round_number,
          dice1,
          dice2,
          sum,
          winningOutcome,
          serverSeed: updatedRound.server_seed, // Revealed seed for verification
          seedHash: updatedRound.seed_hash,
        });
      }

      // Settle bets after 3 second animation
      setTimeout(() => this.settleRoundBets(roundId, sum, winningOutcome), 3000);
    }, 1000);
  }

  /**
   * Settle bets for finished round idempotently
   */
  static settleRoundBets(roundId, sum, winningOutcome) {
    try {
      const bets = db.prepare("SELECT * FROM bets WHERE round_id = ? AND status = 'ACCEPTED'").all(roundId);

      // Multipliers for number bets (2->26x, 3->12x, 4->8x, 5->6x, 6->5x, 8->5x, 9->6x, 10->8x, 11->12x, 12->26x)
      const numberOddsMap = {
        '2': 26, '3': 12, '4': 8, '5': 6, '6': 5,
        '8': 5, '9': 6, '10': 8, '11': 12, '12': 26
      };

      for (const bet of bets) {
        let isWin = false;
        let multiplier = 0;

        if (bet.bet_type === 'DOWN' && sum < 7) {
          isWin = true;
          multiplier = 2;
        } else if (bet.bet_type === 'UP' && sum > 7) {
          isWin = true;
          multiplier = 2;
        } else if (bet.bet_type === 'SEVEN' && sum === 7) {
          isWin = true;
          multiplier = 5;
        } else if (bet.bet_type === String(sum) && numberOddsMap[String(sum)]) {
          isWin = true;
          multiplier = numberOddsMap[String(sum)];
        }

        const now = new Date().toISOString();
        if (isWin) {
          const payoutPaise = bet.stake_amount_paise * multiplier;
          db.prepare("UPDATE bets SET status = 'WON', payout_amount_paise = ?, updated_at = ? WHERE id = ?")
            .run(payoutPaise, now, bet.id);

          const wallet = LedgerService.creditBetWinnings({
            userId: bet.user_id,
            payoutPaise,
            referenceId: roundId,
            gameTitle: '7 Up Down',
            diceResult: `Dice ${sum} (${winningOutcome})`,
            betId: bet.id,
          });

          if (this.ioInstance) {
            this.ioInstance.to(`user_${bet.user_id}`).emit('WALLET_UPDATED', wallet);
            this.ioInstance.to(`user_${bet.user_id}`).emit('BET_SETTLED', {
              betId: bet.id,
              status: 'WON',
              payout: payoutPaise / 100,
              sum,
            });
          }
        } else {
          db.prepare("UPDATE bets SET status = 'LOST', updated_at = ? WHERE id = ?").run(now, bet.id);
          if (this.ioInstance) {
            this.ioInstance.to(`user_${bet.user_id}`).emit('BET_SETTLED', {
              betId: bet.id,
              status: 'LOST',
              payout: 0,
              sum,
            });
          }
        }
      }

      db.prepare("UPDATE game_rounds SET status = 'FINISHED' WHERE id = ?").run(roundId);
    } catch (err) {
      console.error('💥 Error settling round bets:', err);
    } finally {
      // Start next round after 5 seconds unconditionally
      clearTimeout(this.roundTimer);
      this.roundTimer = setTimeout(() => {
        this.createNewRound();
      }, 5000);
    }
  }
}

module.exports = SevenUpDownService;
