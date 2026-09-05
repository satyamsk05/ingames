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
   * Get active/current game round
   */
  static getCurrentRound() {
    const now = new Date().toISOString();
    const dbRound = db.prepare(`
      SELECT * FROM game_rounds 
      WHERE game_id = 'game_7_up_down' AND status = 'BETTING_OPEN' AND betting_close_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).get(now);

    if (dbRound) {
      this.currentRound = dbRound;
    } else {
      this.currentRound = this.createNewRound();
    }
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
      (id, game_id, round_number, status, server_seed, seed_hash, betting_open_at, betting_close_at, created_at)
      VALUES (?, 'game_7_up_down', ?, 'BETTING_OPEN', ?, ?, ?, ?, ?)
    `).run(roundId, nextRoundNumber, serverSeed, seedHash, bettingOpenAt, bettingCloseAt, bettingOpenAt);

    const round = db.prepare('SELECT * FROM game_rounds WHERE id = ?').get(roundId);
    this.currentRound = round;

    if (this.ioInstance) {
      this.ioInstance.emit('ROUND_CREATED', {
        roundId: round.id,
        roundNumber: round.round_number,
        seedHash: round.seed_hash,
        bettingCloseAt: round.betting_close_at,
        timeRemainingSeconds: 15,
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

    const validTypes = ['DOWN', 'UP', 'SEVEN'];
    if (!validTypes.includes(betType.toUpperCase())) {
      throw new Error('INVALID_BET_TYPE');
    }

    if (stakeAmountPaise < 1000) { // Min ₹10
      throw new Error('MIN_BET_AMOUNT_RS_10');
    }

    const betId = 'bet_' + crypto.randomUUID().slice(0, 12);
    const betTitle = `7 Up Down : ${betType.toUpperCase()}`;

    // Deduct stake using ledger engine
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
    `).run(betId, userId, roundId, betType.toUpperCase(), stakeAmountPaise, idempotencyKey, now, now);

    const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);

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
   * Close betting and roll dice using server RNG
   */
  static closeBettingAndRoll(roundId) {
    const round = db.prepare('SELECT * FROM game_rounds WHERE id = ?').get(roundId);
    if (!round || round.status !== 'BETTING_OPEN') return;

    db.prepare(`UPDATE game_rounds SET status = 'BETTING_CLOSED' WHERE id = ?`).run(roundId);

    if (this.ioInstance) {
      this.ioInstance.emit('BETTING_CLOSED', { roundId, message: 'No more bets!' });
    }

    // Roll 2 dice after 1 second delay
    setTimeout(() => {
      const dice1 = Math.floor(Math.random() * 6) + 1;
      const dice2 = Math.floor(Math.random() * 6) + 1;
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
          serverSeed: updatedRound.server_seed,
          seedHash: updatedRound.seed_hash,
        });
      }

      // Settle bets after 3 second animation
      setTimeout(() => this.settleRoundBets(roundId, sum, winningOutcome), 3000);
    }, 1000);
  }

  /**
   * Settle bets for finished round
   */
  static settleRoundBets(roundId, sum, winningOutcome) {
    const bets = db.prepare("SELECT * FROM bets WHERE round_id = ? AND status = 'ACCEPTED'").all(roundId);

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

    // Start next round after 5 seconds
    setTimeout(() => {
      this.createNewRound();
    }, 5000);
  }
}

module.exports = SevenUpDownService;
