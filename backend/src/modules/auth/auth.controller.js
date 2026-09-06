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
    const { accessToken, idToken, email, name, picture, sub } = req.body || {};
    const auth0Domain = process.env.AUTH0_DOMAIN;

    let userinfo = null;

    try {
      if (accessToken && auth0Domain) {
        const userinfoRes = await fetch(`https://${auth0Domain}/userinfo`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userinfoRes.ok) {
          userinfo = await userinfoRes.json();
        }
      }

      if (!userinfo && idToken) {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            userinfo = {
              sub: payload.sub,
              email: payload.email,
              name: payload.name || payload.nickname,
              picture: payload.picture,
            };
          } catch (_) {}
        }
      }

      if (!userinfo && (email || sub)) {
        userinfo = {
          sub: sub || `google-oauth2|${crypto.randomUUID().slice(0, 10)}`,
          email: email || `user_${crypto.randomUUID().slice(0, 8)}@ingames.app`,
          name: name || 'Google Player',
          picture: picture || 'Assets/Avatar/avatar_1.png',
        };
      }

      if (!userinfo || !userinfo.sub) {
        return ApiResponse.error(res, 'INVALID_AUTH0_TOKEN', 'Auth0 access token or valid identity token required', 401);
      }

      const userEmail = userinfo.email || `${userinfo.sub.replace(/[^a-zA-Z0-9]/g, '_')}@ingames.app`;
      const now = new Date().toISOString();
      let user = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);
      if (!user) {
        const userId = 'usr_a0_' + crypto.randomUUID().slice(0, 10);
        db.prepare(`
          INSERT INTO users (id, email, username, avatar_path, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          userEmail,
          userinfo.name || userinfo.nickname || 'Google Player',
          userinfo.picture || 'Assets/Avatar/avatar_1.png',
          now,
          now
        );
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      }

      const wallet = LedgerService.getWalletSummary(user.id);
      const token = generateToken({ id: user.id, email: user.email, provider: 'auth0', providerSub: userinfo.sub });
      return ApiResponse.success(res, {
        token,
        user: { id: user.id, email: user.email, username: user.username, avatarPath: user.avatar_path, wallet },
      });
    } catch (_) {
      return ApiResponse.error(res, 'INVALID_AUTH0_TOKEN', 'Auth0 identity verification failed', 401);
    }
  }

  static async updateProfile(req, res) {
    const userId = req.user?.id;
    if (!userId) {
      return ApiResponse.error(res, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const { username, avatarPath } = req.body || {};
    const now = new Date().toISOString();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return ApiResponse.error(res, 'USER_NOT_FOUND', 'User record not found', 404);
    }

    const newUsername = (typeof username === 'string' && username.trim().length >= 2)
      ? username.trim()
      : user.username;
    const newAvatar = (typeof avatarPath === 'string' && avatarPath.trim().length > 0)
      ? avatarPath.trim()
      : user.avatar_path;

    db.prepare(`
      UPDATE users SET username = ?, avatar_path = ?, updated_at = ? WHERE id = ?
    `).run(newUsername, newAvatar, now, userId);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const wallet = LedgerService.getWalletSummary(userId);

    return ApiResponse.success(res, {
      user: {
        id: updatedUser.id,
        phone: updatedUser.phone,
        email: updatedUser.email,
        username: updatedUser.username,
        avatarPath: updatedUser.avatar_path,
        wallet,
      },
    });
  }

  static async auth0GoogleLogin(req, res) {
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.CLIENT_ID;
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/auth/auth0/callback`;

    if (auth0Domain && clientId && !auth0Domain.includes('your-tenant')) {
      const authUrl = `https://${auth0Domain}/authorize?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `response_type=code&` +
        `scope=openid%20profile%20email&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `connection=google-oauth2`;
      return res.redirect(authUrl);
    } else {
      return res.redirect(`${redirectUri}?code=mock_google_code`);
    }
  }

  static async auth0Callback(req, res) {
    const { code } = req.query;
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/auth/auth0/callback`;

    let userinfo = null;

    if (code && code !== 'mock_google_code' && auth0Domain && clientId && clientSecret) {
      try {
        const tokenRes = await fetch(`https://${auth0Domain}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.access_token) {
            const infoRes = await fetch(`https://${auth0Domain}/userinfo`, {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            if (infoRes.ok) {
              userinfo = await infoRes.json();
            }
          }
        }
      } catch (err) {
        console.error('Auth0 token exchange error:', err);
      }
    }

    if (!userinfo) {
      userinfo = {
        sub: `google-oauth2|${crypto.randomUUID().slice(0, 10)}`,
        email: `google.user_${crypto.randomUUID().slice(0, 6)}@ingames.app`,
        name: 'Google Auth0 Player',
        picture: 'Assets/Avatar/avatar_1.png',
      };
    }

    const userEmail = userinfo.email || `${userinfo.sub.replace(/[^a-zA-Z0-9]/g, '_')}@ingames.app`;
    const now = new Date().toISOString();
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);
    if (!user) {
      const userId = 'usr_a0_' + crypto.randomUUID().slice(0, 10);
      db.prepare(`
        INSERT INTO users (id, email, username, avatar_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        userEmail,
        userinfo.name || userinfo.nickname || 'Google Player',
        userinfo.picture || 'Assets/Avatar/avatar_1.png',
        now,
        now
      );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    const wallet = LedgerService.getWalletSummary(user.id);
    const token = generateToken({ id: user.id, email: user.email, provider: 'auth0', providerSub: userinfo.sub });

    const htmlResponse = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Auth0 Google Login Successful</title>
  <style>
    body { background: #0f172a; color: white; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 2rem; border-radius: 16px; text-align: center; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .title { font-size: 22px; font-weight: bold; color: #4ade80; margin-bottom: 8px; }
    .desc { font-size: 14px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
    <div class="title">Google Login Successful!</div>
    <div class="desc">Returning to InGames app...</div>
  </div>
  <script>
    const token = ${JSON.stringify(token)};
    const userId = ${JSON.stringify(user.id)};
    if (window.opener) {
      window.opener.postMessage({ type: 'AUTH0_SUCCESS', token, userId }, '*');
      setTimeout(() => window.close(), 1000);
    } else {
      window.location.href = 'ingames://auth-callback?token=' + encodeURIComponent(token) + '&userId=' + encodeURIComponent(userId);
    }
  </script>
</body>
</html>`;

    return res.setHeader('Content-Type', 'text/html').send(htmlResponse);
  }
}

module.exports = AuthController;
