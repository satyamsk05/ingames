const db = require('../../config/db');
const ApiResponse = require('../../core/api_response');
const SevenUpDownService = require('./seven_up_down.service');

const activeGames = [
  {
    id: 'game_7_up_down',
    title: '7 Up Down (Dice)',
    category: 'Dice',
    entryFee: 10.0,
    prizePool: 20.0,
    icon: 'assets/nav_icon/nav_game.png',
    gameUrl: '/games/seven_up_down/index.html',
    badge: 'HOT 🔥',
    activePlayers: 4520,
  },
  {
    id: 'game_fruit_slice',
    title: 'Fruit Slice Ninja',
    category: 'Arcade',
    entryFee: 10.0,
    prizePool: 18.0,
    icon: 'assets/nav_icon/nav_game.png',
    gameUrl: '/games/fruit_slice/index.html',
    badge: 'POPULAR ⭐',
    activePlayers: 1420,
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
    const timeRemainingSeconds = Math.max(0, Math.floor((closeAt.getTime() - now.getTime()) / 1000));

    return ApiResponse.success(res, {
      roundId: round.id,
      roundNumber: round.round_number,
      status: round.status,
      seedHash: round.seed_hash,
      timeRemainingSeconds,
      bettingOpenAt: round.betting_open_at,
      bettingCloseAt: round.betting_close_at,
    });
  }

  static async joinGameAndPlaceBet(req, res) {
    const userId = req.user?.id || req.body.userId;
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
        idempotencyKey: idempotencyKey || 'bet_idemp_' + Date.now(),
      });

      return ApiResponse.success(res, result);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        return ApiResponse.error(res, 'INSUFFICIENT_BALANCE', 'Insufficient total wallet balance to place bet', 400);
      }
      return ApiResponse.error(res, 'BET_FAILED', err.message, 400);
    }
  }

  static async getBetHistory(req, res) {
    const userId = req.user?.id || req.query.userId;
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
