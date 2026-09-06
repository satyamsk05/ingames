const db = require('../../config/db');
const ApiResponse = require('../../core/api_response');
const LedgerService = require('../wallet/ledger.service');
const { generateToken } = require('../../core/auth_middleware');

class AdminController {
  async login(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return ApiResponse.error(res, 'BAD_REQUEST', 'Username and password are required', 400);
      }

      // Default Admin Creds check
      if ((username === 'admin' || username === '9999999999') && password === 'admin123') {
        const token = generateToken({
          id: 'admin_root',
          username: 'Admin',
          role: 'admin',
          isAdmin: true,
        });

        return ApiResponse.success(res, {
          token,
          admin: {
            id: 'admin_root',
            username: 'Super Admin',
            role: 'admin',
          },
        }, 'Admin login successful');
      }

      return ApiResponse.error(res, 'UNAUTHORIZED', 'Invalid admin credentials', 401);
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Admin login failed', 500);
    }
  }

  async getStats(req, res) {
    try {
      let totalUsers = 0;
      try {
        const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
        totalUsers = row ? row.count : 0;
      } catch (_) {}

      let totalDeposits = 0;
      let totalWithdrawals = 0;
      try {
        const depRow = db.prepare("SELECT SUM(amount) as total FROM ledger_entries WHERE type = 'CREDIT' AND category = 'DEPOSIT'").get();
        if (depRow && depRow.total) totalDeposits = depRow.total;

        const wRow = db.prepare("SELECT SUM(amount) as total FROM ledger_entries WHERE type = 'DEBIT' AND category = 'WITHDRAWAL'").get();
        if (wRow && wRow.total) totalWithdrawals = wRow.total;
      } catch (_) {}

      let pendingWithdrawals = 0;
      try {
        const pwRow = db.prepare("SELECT COUNT(*) as count FROM withdrawal_requests WHERE status = 'PENDING'").get();
        if (pwRow) pendingWithdrawals = pwRow.count;
      } catch (_) {}

      return ApiResponse.success(res, {
        totalUsers,
        totalDeposits,
        totalWithdrawals,
        pendingWithdrawals,
        netProfit: Math.max(0, totalDeposits - totalWithdrawals),
        activeGamesCount: 4,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to fetch admin stats', 500);
    }
  }

  async getUsers(req, res) {
    try {
      let users = [];
      try {
        users = db.prepare('SELECT id, phone, username, avatar_path, is_blocked, created_at FROM users ORDER BY created_at DESC LIMIT 100').all();
      } catch (_) {
        users = [];
      }

      const usersWithWallets = users.map(user => {
        let balanceSummary = { cashBalance: 0, winningsBalance: 0, bonusBalance: 0, totalBalance: 0 };
        try {
          const summary = LedgerService.getWalletSummary(user.id);
          if (summary) balanceSummary = summary;
        } catch (_) {}

        return {
          id: user.id,
          phone: user.phone || 'N/A',
          username: user.username || `Player_${user.id.slice(-4)}`,
          avatarPath: user.avatar_path || '/avatars/avatar_1.png',
          isBlocked: !!user.is_blocked,
          createdAt: user.created_at || new Date().toISOString(),
          wallet: balanceSummary,
        };
      });

      return ApiResponse.success(res, usersWithWallets);
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to fetch users', 500);
    }
  }

  async updateUserBalance(req, res) {
    try {
      const { userId, type, amount, note } = req.body;
      if (!userId || !amount || amount <= 0) {
        return ApiResponse.error(res, 'BAD_REQUEST', 'UserId and valid positive amount are required', 400);
      }

      const targetType = (type || 'DEPOSIT').toUpperCase(); // DEPOSIT, WINNINGS, BONUS
      const entryType = req.body.action === 'DEDUCT' ? 'DEBIT' : 'CREDIT';

      const entry = LedgerService.recordTransaction({
        userId,
        amount: parseFloat(amount),
        type: entryType,
        category: targetType,
        referenceId: `ADMIN_ADJ_${Date.now()}`,
        description: note || `Admin Manual Balance Adjustment (${entryType})`,
      });

      const updatedWallet = LedgerService.getWalletSummary(userId);

      return ApiResponse.success(res, {
        transaction: entry,
        wallet: updatedWallet,
      }, 'User balance updated successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to update user balance', 500);
    }
  }

  async toggleUserBlock(req, res) {
    try {
      const { userId, isBlocked } = req.body;
      if (!userId) {
        return ApiResponse.error(res, 'BAD_REQUEST', 'UserId is required', 400);
      }

      try {
        db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(isBlocked ? 1 : 0, userId);
      } catch (_) {}

      return ApiResponse.success(res, { userId, isBlocked: !!isBlocked }, `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`);
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to toggle user block status', 500);
    }
  }

  async getWithdrawals(req, res) {
    try {
      let requests = [];
      try {
        requests = db.prepare('SELECT * FROM withdrawal_requests ORDER BY created_at DESC LIMIT 100').all();
      } catch (_) {}

      return ApiResponse.success(res, requests);
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to fetch withdrawal requests', 500);
    }
  }

  async approveWithdrawal(req, res) {
    try {
      const { requestId } = req.body;
      if (!requestId) return ApiResponse.error(res, 'BAD_REQUEST', 'RequestId is required', 400);

      try {
        db.prepare("UPDATE withdrawal_requests SET status = 'APPROVED', processed_at = ? WHERE id = ?").run(new Date().toISOString(), requestId);
      } catch (_) {}

      return ApiResponse.success(res, { requestId, status: 'APPROVED' }, 'Withdrawal approved successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to approve withdrawal', 500);
    }
  }

  async rejectWithdrawal(req, res) {
    try {
      const { requestId, reason } = req.body;
      if (!requestId) return ApiResponse.error(res, 'BAD_REQUEST', 'RequestId is required', 400);

      let reqItem = null;
      try {
        reqItem = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(requestId);
      } catch (_) {}

      if (reqItem && reqItem.status === 'PENDING') {
        // Refund winnings balance
        LedgerService.recordTransaction({
          userId: reqItem.user_id,
          amount: reqItem.amount,
          type: 'CREDIT',
          category: 'WINNINGS',
          referenceId: `REFUND_${requestId}`,
          description: `Withdrawal Rejected Refund: ${reason || 'Admin rejected'}`,
        });

        db.prepare("UPDATE withdrawal_requests SET status = 'REJECTED', note = ?, processed_at = ? WHERE id = ?").run(reason || 'Admin rejected', new Date().toISOString(), requestId);
      }

      return ApiResponse.success(res, { requestId, status: 'REJECTED' }, 'Withdrawal rejected and balance refunded');
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to reject withdrawal', 500);
    }
  }

  async getGameConfigs(req, res) {
    try {
      const games = [
        { id: 'classic_dice', title: 'Classic Dice', imagePath: '/games/classic_dice.png', accentColor: '#00E676', isAvailable: true, minBet: 10, maxBet: 10000 },
        { id: 'double', title: 'Double', imagePath: '/games/double.png', accentColor: '#FFD700', isAvailable: true, minBet: 10, maxBet: 10000 },
        { id: '7updown', title: '7 Up Down', imagePath: '/games/7updown.png', accentColor: '#FF4081', isAvailable: true, minBet: 10, maxBet: 10000 },
        { id: 'mines', title: 'Mines', imagePath: '/games/mines.png', accentColor: '#7C4DFF', isAvailable: true, minBet: 10, maxBet: 10000 },
      ];
      return ApiResponse.success(res, games);
    } catch (error) {
      return ApiResponse.error(res, error.message || 'Failed to fetch game configs', 500);
    }
  }
}

module.exports = new AdminController();
