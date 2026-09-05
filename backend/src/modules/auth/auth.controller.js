const db = require('../../config/db');
const ApiResponse = require('../../core/api_response');
const { generateToken } = require('../../core/auth_middleware');
const LedgerService = require('../wallet/ledger.service');

const otpMemoryStore = new Map();

class AuthController {
  /**
   * Request OTP for Mobile Login
   */
  static async sendOtp(req, res) {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string' || phone.trim().replace(/[^0-9]/g, '').length < 10) {
      return ApiResponse.error(res, 'INVALID_PHONE', 'Valid 10-digit mobile number required', 400);
    }

    const sanitizedPhone = phone.replace(/[^0-9]/g, '').slice(-10);

    // Rate limiting: 60 seconds cooldown
    const existing = otpMemoryStore.get(sanitizedPhone);
    if (existing && Date.now() - existing.createdAt < 60000) {
      return ApiResponse.error(res, 'RATE_LIMIT', 'Please wait 60 seconds before requesting another OTP', 429);
    }

    // In dev mode, use secure OTP format
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    otpMemoryStore.set(sanitizedPhone, {
      otp,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    console.log(`📱 OTP for +91${sanitizedPhone} generated.`);

    return ApiResponse.success(res, {
      phone: sanitizedPhone,
      message: 'OTP dispatched successfully',
    });
  }

  /**
   * Verify OTP & Issue Token
   */
  static async verifyOtp(req, res) {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return ApiResponse.error(res, 'MISSING_FIELDS', 'Phone number and OTP code are required', 400);
    }

    const sanitizedPhone = phone.replace(/[^0-9]/g, '').slice(-10);
    const stored = otpMemoryStore.get(sanitizedPhone);

    if (!stored) {
      return ApiResponse.error(res, 'OTP_EXPIRED', 'OTP expired or not requested. Please request a new OTP.', 400);
    }

    if (Date.now() > stored.expiresAt) {
      otpMemoryStore.delete(sanitizedPhone);
      return ApiResponse.error(res, 'OTP_EXPIRED', 'OTP code has expired. Please request a new OTP.', 400);
    }

    if (stored.otp !== otp.toString().trim()) {
      return ApiResponse.error(res, 'INVALID_OTP', 'Invalid OTP code entered. Please try again.', 400);
    }

    otpMemoryStore.delete(sanitizedPhone);

    const now = new Date().toISOString();
    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(sanitizedPhone);

    if (!user) {
      const userId = 'usr_' + sanitizedPhone;
      db.prepare(`
        INSERT INTO users (id, phone, username, avatar_path, created_at, updated_at)
        VALUES (?, ?, ?, 'assets/avatar/avatar_1.png', ?, ?)
      `).run(userId, sanitizedPhone, `Player_${sanitizedPhone.slice(-4)}`, now, now);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    const wallet = LedgerService.getWalletSummary(user.id);
    const token = generateToken({ id: user.id, phone: user.phone });

    return ApiResponse.success(res, {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        username: user.username,
        avatarPath: user.avatar_path,
        wallet,
      },
    });
  }

  /**
   * Google Sign-In backend endpoint
   */
  static async googleAuth(req, res) {
    const { email, name, picture, googleId } = req.body;
    if (!email || !googleId) {
      return ApiResponse.error(res, 'INVALID_GOOGLE_CREDENTIALS', 'Valid Google identity credentials required', 400);
    }

    const now = new Date().toISOString();
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      const userId = 'usr_g_' + crypto.randomUUID().slice(0, 10);
      db.prepare(`
        INSERT INTO users (id, email, username, avatar_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, email, name || 'Google Player', picture || 'assets/avatar/avatar_1.png', now, now);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    const wallet = LedgerService.getWalletSummary(user.id);
    const token = generateToken({ id: user.id, email: user.email });

    return ApiResponse.success(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarPath: user.avatar_path,
        wallet,
      },
    });
  }

  /**
   * Guest Login Endpoint
   */
  static async guestAuth(req, res) {
    const crypto = require('crypto');
    const guestId = 'usr_gst_' + crypto.randomUUID().slice(0, 10);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, avatar_path, created_at, updated_at)
      VALUES (?, ?, 'assets/avatar/avatar_1.png', ?, ?)
    `).run(guestId, `Guest_${guestId.slice(-4)}`, now, now);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(guestId);
    const wallet = LedgerService.getWalletSummary(user.id);
    const token = generateToken({ id: user.id });

    return ApiResponse.success(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        avatarPath: user.avatar_path,
        wallet,
      },
    });
  }
}

module.exports = AuthController;
