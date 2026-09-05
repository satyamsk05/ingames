const db = require('../../config/db');
const ApiResponse = require('../../core/api_response');
const LedgerService = require('./ledger.service');

class WalletController {
  static async getProfileAndWallet(req, res) {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return ApiResponse.error(res, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return ApiResponse.error(res, 'USER_NOT_FOUND', 'User record not found', 404);
    }

    const wallet = LedgerService.getWalletSummary(userId);

    return ApiResponse.success(res, {
      id: user.id,
      username: user.username,
      phoneNumber: user.phone,
      email: user.email,
      avatarPath: user.avatar_path,
      depositBalance: wallet.cashBalance,
      winningsBalance: wallet.winningsBalance,
      rewardsBalance: wallet.bonusBalance,
      lockedBalance: wallet.lockedBalance,
      totalBalance: wallet.totalBalance,
      wallet,
    });
  }

  static async addCash(req, res) {
    const userId = req.user?.id || req.body.userId;
    const { amount, paymentMethod, idempotencyKey } = req.body;
    const numAmount = parseFloat(amount);

    if (!userId) return ApiResponse.error(res, 'UNAUTHORIZED', 'User session required', 401);
    if (isNaN(numAmount) || numAmount < 10) {
      return ApiResponse.error(res, 'INVALID_AMOUNT', 'Minimum deposit amount is ₹10', 400);
    }

    const amountPaise = Math.round(numAmount * 100);
    const referenceId = 'dep_' + Math.floor(Date.now() / 1000);

    try {
      const walletSummary = LedgerService.creditDeposit({
        userId,
        amountPaise,
        referenceId,
        paymentMethod: paymentMethod || 'UPI',
        idempotencyKey: idempotencyKey || referenceId,
      });

      return ApiResponse.success(res, {
        message: `₹${numAmount} added successfully via ${paymentMethod || 'UPI'}`,
        wallet: walletSummary,
      });
    } catch (err) {
      return ApiResponse.error(res, 'DEPOSIT_FAILED', err.message, 400);
    }
  }

  static async withdraw(req, res) {
    const userId = req.user?.id || req.body.userId;
    const { amount, upiId, idempotencyKey } = req.body;
    const numAmount = parseFloat(amount);

    if (!userId) return ApiResponse.error(res, 'UNAUTHORIZED', 'User session required', 401);
    if (isNaN(numAmount) || numAmount < 100) {
      return ApiResponse.error(res, 'INVALID_AMOUNT', 'Minimum withdrawal amount is ₹100', 400);
    }

    if (!upiId || typeof upiId !== 'string' || !upiId.includes('@')) {
      return ApiResponse.error(res, 'INVALID_UPI', 'Valid UPI ID required (e.g. name@upi)', 400);
    }

    const amountPaise = Math.round(numAmount * 100);

    try {
      const result = LedgerService.requestWithdrawal({
        userId,
        amountPaise,
        upiId: upiId.trim(),
        idempotencyKey: idempotencyKey || 'wdr_idemp_' + Date.now(),
      });

      return ApiResponse.success(res, {
        message: `Withdrawal of ₹${numAmount} initiated to ${upiId}`,
        withdrawalId: result.withdrawalId,
        wallet: result.wallet,
      });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_WINNINGS_BALANCE') {
        return ApiResponse.error(res, 'INSUFFICIENT_WINNINGS', 'Withdrawal amount exceeds available winnings balance', 400);
      }
      return ApiResponse.error(res, 'WITHDRAWAL_FAILED', err.message, 400);
    }
  }

  static async getTransactions(req, res) {
    const userId = req.user?.id || req.query.userId;
    if (!userId) return ApiResponse.error(res, 'UNAUTHORIZED', 'User session required', 401);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const rows = db.prepare(`
      SELECT * FROM transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const totalCount = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE user_id = ?').get(userId).count;

    const formatted = rows.map(r => ({
      id: r.id,
      title: r.title,
      amount: r.amount_paise / 100,
      isCredit: Boolean(r.is_credit),
      timestamp: r.created_at,
      category: r.category,
      type: r.type,
      referenceId: r.reference_id,
    }));

    return ApiResponse.success(res, {
      items: formatted,
      page,
      limit,
      totalCount,
      hasMore: offset + rows.length < totalCount,
    });
  }
}

module.exports = WalletController;
