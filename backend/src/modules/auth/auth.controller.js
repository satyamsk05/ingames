const db = require('../../config/db');
const crypto = require('crypto');
const ApiResponse = require('../../core/api_response');
const { generateToken } = require('../../core/auth_middleware');
const LedgerService = require('../wallet/ledger.service');

const otpMemoryStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

class AuthController {
  static async sendOtp(req, res) {
    const sanitizedPhone = normalizePhone(req.body?.phone);
    if (!sanitizedPhone) {
      return ApiResponse.error(res, 'INVALID_PHONE', 'Valid 10-digit mobile number required', 400);
    }

    const existing = otpMemoryStore.get(sanitizedPhone);
    if (existing && Date.now() - existing.createdAt < OTP_RESEND_MS) {
      return ApiResponse.error(res, 'RATE_LIMIT', 'Please wait before requesting another OTP', 429);
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    otpMemoryStore.set(sanitizedPhone, {
      otpHash: hashOtp(otp),
      createdAt: Date.now(),
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    });

    // A real SMS/WhatsApp provider must be wired here before production use.
    if (process.env.NODE_ENV === 'production') {
      return ApiResponse.error(res, 'OTP_PROVIDER_NOT_CONFIGURED', 'OTP delivery is not configured', 503);
    }

    console.log(`📱 OTP generated for +91${sanitizedPhone} (development only).`);
    return ApiResponse.success(res, {
      phone: sanitizedPhone,
      message: 'OTP generated for development',
      ...(process.env.NODE_ENV === 'development' ? { developmentOtp: otp } : {}),
    });
  }

  static async verifyOtp(req, res) {
    const sanitizedPhone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || '').trim();
    if (!sanitizedPhone || !/^\d{6}$/.test(otp)) {
      return ApiResponse.error(res, 'INVALID_OTP', 'Invalid OTP code', 400);
    }

    const stored = otpMemoryStore.get(sanitizedPhone);
    if (!stored || Date.now() > stored.expiresAt) {
      otpMemoryStore.delete(sanitizedPhone);
      return ApiResponse.error(res, 'OTP_EXPIRED', 'OTP expired or invalid', 400);
    }

    if (stored.attempts >= OTP_MAX_ATTEMPTS) {
      otpMemoryStore.delete(sanitizedPhone);
      return ApiResponse.error(res, 'OTP_LOCKED', 'Too many invalid attempts', 429);
    }

    if (hashOtp(otp) !== stored.otpHash) {
      stored.attempts += 1;
      return ApiResponse.error(res, 'INVALID_OTP', 'Invalid OTP code', 400);
    }

    otpMemoryStore.delete(sanitizedPhone);

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

  static async googleAuth(req, res) {
    const { idToken } = req.body || {};
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!idToken || !clientId) {
      return ApiResponse.error(res, 'INVALID_GOOGLE_CREDENTIALS', 'Verified Google ID token required', 401);
    }

    try {
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!response.ok) throw new Error('GOOGLE_TOKEN_INVALID');
      const verified = await response.json();
      if (verified.aud !== clientId || verified.email_verified !== 'true' || !verified.sub || !verified.email) {
        throw new Error('GOOGLE_IDENTITY_INVALID');
      }

      const now = new Date().toISOString();
      let user = db.prepare('SELECT * FROM users WHERE email = ?').get(verified.email);
      if (!user) {
        const userId = 'usr_g_' + crypto.randomUUID().slice(0, 10);
        db.prepare(`
          INSERT INTO users (id, email, username, avatar_path, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, verified.email, verified.name || 'Google Player', verified.picture || 'assets/avatar/avatar_1.png', now, now);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      }

      const wallet = LedgerService.getWalletSummary(user.id);
      const token = generateToken({ id: user.id, email: user.email, provider: 'google', providerSub: verified.sub });
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
    } catch (_) {
      return ApiResponse.error(res, 'INVALID_GOOGLE_CREDENTIALS', 'Google identity verification failed', 401);
    }
  }

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

  static async auth0Auth(req, res) {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      return ApiResponse.error(res, 'INVALID_AUTH0_TOKEN', 'Auth0 access token required', 401);
    }

    try {
      const auth0Domain = process.env.AUTH0_DOMAIN;
      if (!auth0Domain) throw new Error('AUTH0_DOMAIN_NOT_CONFIGURED');
      const userinfoRes = await fetch(`https://${auth0Domain}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userinfoRes.ok) throw new Error('AUTH0_TOKEN_INVALID');
      const userinfo = await userinfoRes.json();
      const auth0Sub = userinfo.sub;
      const userEmail = userinfo.email;
      if (!auth0Sub || !userEmail) throw new Error('AUTH0_IDENTITY_INVALID');

      const now = new Date().toISOString();
      let user = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);
      if (!user) {
        const userId = 'usr_a0_' + crypto.randomUUID().slice(0, 10);
        db.prepare(`
          INSERT INTO users (id, email, username, avatar_path, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, userEmail, userinfo.name || userinfo.nickname || 'Auth0 Player', userinfo.picture || 'assets/avatar/avatar_1.png', now, now);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      }

      const wallet = LedgerService.getWalletSummary(user.id);
      const token = generateToken({ id: user.id, email: user.email, provider: 'auth0', providerSub: auth0Sub });
      return ApiResponse.success(res, {
        token,
        user: { id: user.id, email: user.email, username: user.username, avatarPath: user.avatar_path, wallet },
      });
    } catch (_) {
      return ApiResponse.error(res, 'INVALID_AUTH0_TOKEN', 'Auth0 identity verification failed', 401);
    }
  }
}

module.exports = AuthController;
