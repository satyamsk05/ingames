# Authentication & Authorization Fix Specification

## 1. JWT
Production must fail fast if `JWT_SECRET` is missing.

Bad:
```js
const secret = process.env.JWT_SECRET || 'super_secret_ingames_jwt_key_2026_production';
```

Good:
```js
const secret = process.env.JWT_SECRET;
if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is required in production');
}
```

Use a sufficiently random secret from the deployment secret manager. Never commit it.

## 2. Route authorization
Sensitive routes must use `authMiddleware`.

Bad:
```js
router.post('/wallet/withdraw', optionalAuthMiddleware, WalletController.withdraw);
```

Good:
```js
router.post('/wallet/withdraw', authMiddleware, WalletController.withdraw);
```

Controller identity:
```js
const userId = req.user.id;
if (!userId) throw new Error('UNAUTHORIZED');
```

Delete any fallback to `req.body.userId`, `req.query.userId`, or a userId embedded in client state for ownership decisions.

## 3. Google sign-in
The client must send an actual Google ID token/credential. Backend verifies it with Google's official token verification mechanism, then uses verified claims (`sub`, `email`, `email_verified`, etc.). Do not accept a free-form `googleId` as proof of identity.

Required server behavior:
```js
const verified = await verifyGoogleIdToken(idToken);
if (!verified.email_verified) throw new Error('EMAIL_NOT_VERIFIED');
const googleSubject = verified.sub;
// Find/create user by provider + provider_subject, not by untrusted client email.
```

Also fix missing import if crypto UUID remains:
```js
const crypto = require('crypto');
```

## 4. OTP
Requirements:
- exact Indian mobile normalization/validation
- cryptographically secure random OTP
- store only a hash
- 5-minute expiry
- max verification attempts per challenge
- resend cooldown
- per-IP and per-phone rate limits
- durable/shared store in multi-instance deployments
- real SMS/WhatsApp provider adapter
- generic responses that do not leak account existence
- audit events without logging OTP values

Example OTP generation:
```js
const otp = crypto.randomInt(100000, 1000000).toString();
const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
```

Do not log:
```js
console.log(`OTP: ${otp}`); // WRONG
```

## 5. Logout
Logout must clear the client token/session. If refresh tokens are introduced, revoke/rotate them server-side.

Flutter shape:
```dart
await tokenManager.clearSession();
// then reset authenticated app state
```

## 6. Demo fallbacks
Remove fake auth response such as local JWT strings or fake wallet values. An unavailable backend must produce an error/offline state, never a successful authenticated user.

## 7. Authorization tests
Must include:
- user A cannot read user B profile
- user A cannot withdraw from user B
- user A cannot query user B transactions
- user A cannot place a bet for user B
- forged userId in body/query is ignored/rejected
- invalid/expired JWT rejected
- socket cannot join another user's room
