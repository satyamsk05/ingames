const db = require('../../config/db');
const ApiResponse = require('../../core/api_response');
const SevenUpDownService = require('./seven_up_down.service');

const activeGames = [
  {
    id: 'game_7_up_down',
    title: 'Classic Dice',
    category: 'Dice',
    entryFee: 10.0,
    prizePool: 20.0,
    icon: 'Assets/images/classic_dice.png',
    gameUrl: '/games/seven_up_down/index.html',
    badge: 'HOT 🔥',
    activePlayers: 4520,
  },
  {
    id: 'game_double',
    title: 'Double',
    category: 'Multiplier',
    entryFee: 20.0,
    prizePool: 100.0,
    icon: 'Assets/images/double.png',
    gameUrl: '/games/seven_up_down/index.html',
    badge: 'POPULAR 💎',
    activePlayers: 3890,
  },
  {
    id: 'game_mines',
    title: 'Mines',
    category: 'Arcade',
    entryFee: 10.0,
    prizePool: 50.0,
    icon: 'Assets/images/mines.png',
    gameUrl: '/games/seven_up_down/index.html',
    badge: 'NEW 💥',
    activePlayers: 6240,
  },
];

class GameController {
  static async getGames(req, res) {
    return ApiResponse.success(res, activeGames);
  }

  static async get7UpDownRound(req, res) {
    const round = SevenUpDownService.getCurrentRound();
    const now = new Date();
    const closeAt = new Date(round.betting_close_at);
    const remainingMs = Math.max(0, closeAt.getTime() - now.getTime());
    const timeRemainingSeconds = Math.floor(remainingMs / 1000);
    const recentHistory = SevenUpDownService.getRecentHistory(50);

    return ApiResponse.success(res, {
      roundId: round.id,
      roundNumber: round.round_number,
      status: round.status,
      seedHash: round.seed_hash,
      fairnessVersion: round.fairness_version || 1,
      timeRemainingSeconds,
      remainingMs,
      bettingOpenAt: round.betting_open_at,
      bettingCloseAt: round.betting_close_at,
      serverSeed: round.status === 'FINISHED' ? round.server_seed : null,
      recentHistory,
    });
  }

  static async joinGameAndPlaceBet(req, res) {
    const userId = req.user?.id;
    if (!userId) return ApiResponse.error(res, 'UNAUTHORIZED', 'User session required', 401);

    const { roundId, betType, stakeAmount, idempotencyKey } = req.body;
    const stake = parseFloat(stakeAmount) || 10.0;
    const stakePaise = Math.round(stake * 100);

    try {
      const activeRound = roundId || SevenUpDownService.getCurrentRound().id;
      const result = SevenUpDownService.placeBet({
        userId,
        roundId: activeRound,
        betType: betType || 'DOWN',
        stakeAmountPaise: stakePaise,
        idempotencyKey,
      });

      return ApiResponse.success(res, result);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        return ApiResponse.error(res, 'INSUFFICIENT_BALANCE', 'Insufficient total wallet balance to place bet', 400);
      }
      if (err.message === 'IDEMPOTENCY_KEY_REUSE') {
        return ApiResponse.error(res, 'IDEMPOTENCY_KEY_REUSE', 'Idempotency key reused for different bet amount', 400);
      }
      return ApiResponse.error(res, 'BET_FAILED', err.message, 400);
    }
  }

  static async getBetHistory(req, res) {
    const userId = req.user?.id;
    if (!userId) return ApiResponse.error(res, 'UNAUTHORIZED', 'User session required', 401);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const rows = db.prepare(`
      SELECT b.*, r.round_number, r.result_dice_1, r.result_dice_2, r.result_sum
      FROM bets b
      LEFT JOIN game_rounds r ON b.round_id = r.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const formatted = rows.map(r => ({
      id: r.id,
      roundId: r.round_id,
      roundNumber: r.round_number,
      gameTitle: '7 Up Down',
      betType: r.bet_type,
      stakeAmount: r.stake_amount_paise / 100,
      payoutAmount: r.payout_amount_paise / 100,
      status: r.status,
      diceResult: r.result_sum ? `Dice ${r.result_dice_1}+${r.result_dice_2}=${r.result_sum}` : 'Pending',
      timestamp: r.created_at,
    }));

    return ApiResponse.success(res, formatted);
  }
}

module.exports = GameController;
