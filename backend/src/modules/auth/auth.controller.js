const db = require('../../config/db');
const crypto = require('crypto');
const ApiResponse = require('../../core/api_response');
const { generateToken } = require('../../core/auth_middleware');
const LedgerService = require('../wallet/ledger.service');
const LogginService = require('./loggin.service');

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

class AuthController {
  static async guestAuth(req, res) {
    const guestId = 'usr_gst_' + crypto.randomUUID().slice(0, 10);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, username, avatar_path, created_at, updated_at)
      VALUES (?, ?, 'assets/avatar/avatar_1.png', ?, ?)
    `).run(guestId, `Guest_${guestId.slice(-4)}`, now, now);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(guestId);
    const wallet = LedgerService.getWalletSummary(user.id);
    const token = generateToken({ id: user.id, guest: true });
    return ApiResponse.success(res, {
      token,
      user: { id: user.id, username: user.username, avatarPath: user.avatar_path, wallet },
    });
  }

  static async createLogginToken(req, res) {
    try {
      const result = LogginService.createToken();
      return ApiResponse.success(res, {
        token: result.token,
        link: result.link,
      });
    } catch (err) {
      console.error('Loggin createToken error:', err);
      return ApiResponse.error(res, 'LOGGIN_CREATE_TOKEN_FAILED', err.message || 'Failed to create Loggin auth token', 500);
    }
  }

  static async verifyLogginToken(req, res) {
    const { token: logginToken } = req.body || {};
    if (!logginToken || typeof logginToken !== 'string') {
      return ApiResponse.error(res, 'INVALID_TOKEN', 'Loggin token is required', 400);
    }

    try {
      const session = await LogginService.waitForVerify(logginToken);
      if (!session || !session.phone) {
        return ApiResponse.error(res, 'LOGGIN_VERIFICATION_FAILED', 'Failed to verify identity with Loggin', 400);
      }

      const sanitizedPhone = normalizePhone(session.phone);
      if (!sanitizedPhone) {
        return ApiResponse.error(res, 'INVALID_PHONE', 'Verified phone number format is invalid', 400);
      }

      const now = new Date().toISOString();
      let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(sanitizedPhone);
      if (!user) {
        const userId = 'usr_' + crypto.randomUUID().slice(0, 10);
        db.prepare(`
          INSERT INTO users (id, phone, username, avatar_path, created_at, updated_at)
          VALUES (?, ?, ?, 'assets/avatar/avatar_1.png', ?, ?)
        `).run(userId, sanitizedPhone, `Player_${sanitizedPhone.slice(-4)}`, now, now);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      }

      const wallet = LedgerService.getWalletSummary(user.id);
      const appToken = generateToken({ id: user.id, phone: user.phone });
      return ApiResponse.success(res, {
        token: appToken,
        user: {
          id: user.id,
          phone: user.phone,
          username: user.username,
          avatarPath: user.avatar_path,
          wallet,
        },
      });
    } catch (err) {
      console.error('Loggin verifyToken error:', err);
      return ApiResponse.error(res, 'LOGGIN_VERIFY_FAILED', err.message || 'Loggin verification failed', 400);
    }
  }

  static async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { username, avatarPath } = req.body || {};
      const now = new Date().toISOString();

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        return ApiResponse.error(res, 'USER_NOT_FOUND', 'User not found', 404);
      }

      const updatedUsername = username && typeof username === 'string' && username.trim().length > 0
        ? username.trim()
        : user.username;
      const updatedAvatar = avatarPath && typeof avatarPath === 'string' && avatarPath.trim().length > 0
        ? avatarPath.trim()
        : user.avatar_path;

      db.prepare(`
        UPDATE users
        SET username = ?, avatar_path = ?, updated_at = ?
        WHERE id = ?
      `).run(updatedUsername, updatedAvatar, now, userId);

      const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      const wallet = LedgerService.getWalletSummary(userId);

      return ApiResponse.success(res, {
        user: {
          id: updatedUser.id,
          phone: updatedUser.phone,
          username: updatedUser.username,
          avatarPath: updatedUser.avatar_path,
          wallet,
        },
      });
    } catch (err) {
      console.error('Update profile error:', err);
      return ApiResponse.error(res, 'UPDATE_PROFILE_FAILED', err.message || 'Failed to update profile', 500);
    }
  }
}

module.exports = AuthController;
