  static async joinGameAndPlaceBet(req, res) {
    const userId = req.user?.id;
    if (!userId) return ApiResponse.error(res, 'UNAUTHORIZED', 'User session required', 401);

    const { roundId, betType, stakeAmount, idempotencyKey } = req.body || {};
    if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(idempotencyKey))) {
      return ApiResponse.error(res, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid idempotency key is required', 400);
    }

    const stake = typeof stakeAmount === 'number' ? stakeAmount : Number(stakeAmount);
    if (!Number.isFinite(stake) || stake < 10 || stake > 500) {
      return ApiResponse.error(res, 'INVALID_STAKE_AMOUNT', 'Stake must be between ₹10 and ₹500', 400);
    }
    const stakePaise = Math.round(stake * 100);
    if (!Number.isSafeInteger(stakePaise)) {
      return ApiResponse.error(res, 'INVALID_STAKE_AMOUNT', 'Invalid stake amount', 400);
    }

    try {
      const existing = db.prepare('SELECT * FROM bets WHERE user_id = ? AND idempotency_key = ?').get(userId, idempotencyKey);
      if (existing) {
        if (existing.stake_amount_paise !== stakePaise) {
          return ApiResponse.error(res, 'IDEMPOTENCY_KEY_REUSE', 'Idempotency key reused for a different bet', 400);
        }
        const wallet = require('./../wallet/ledger.service').getWalletSummary(userId);
        return ApiResponse.success(res, {
          betId: existing.id,
          roundId: existing.round_id,
          betType: existing.bet_type,
          stakeAmount: existing.stake_amount_paise / 100,
          status: existing.status,
          wallet,
        });
      }

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
      if (err.message === 'ROUND_EXPIRED' || err.message === 'BETTING_CLOSED') {
        return ApiResponse.error(res, err.message, 'Betting is closed for this round', 409);
      }
      if (err.message === 'MIN_BET_AMOUNT_RS_10') {
        return ApiResponse.error(res, 'INVALID_STAKE_AMOUNT', 'Stake must be at least ₹10', 400);
      }
      return ApiResponse.error(res, 'BET_FAILED', err.message, 400);
    }
  }
