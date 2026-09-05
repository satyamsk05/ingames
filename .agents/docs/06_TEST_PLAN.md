# Production Test Plan

## Static
- `node --check` every backend/public JS file
- `npm ci` succeeds from `backend/`
- `flutter analyze` has zero errors/warnings that block release
- `flutter test` passes

## Auth
- valid OTP login
- expired OTP
- wrong OTP
- max OTP attempts
- resend cooldown
- rate limiting
- invalid JWT
- expired JWT
- user A cannot access user B
- Google token verification failure
- unverified Google email rejection
- logout clears session

## Wallet concurrency
Test starting balance ₹10000:
```text
Request A: debit ₹8000
Request B: debit ₹8000
Expected: one success, one failure
Final balance: ₹2000
```

Repeat with many concurrent requests.

## Idempotency
- same bet request twice -> one bet/debit
- same withdrawal request twice -> one withdrawal
- same payment webhook twice -> one credit
- same idempotency key with different amount -> rejection

## Deposit
- order creation
- successful signed webhook
- invalid signature
- wrong amount
- wrong currency
- unknown provider order
- replayed webhook
- delayed webhook

## Withdrawal
- insufficient funds
- pending
- provider success
- provider failure
- reversal
- duplicate callback
- UI never reports success while server is pending

## 7UP-DOWN
- round creation
- close betting
- reject late bet
- deterministic result vector
- payout correctness
- duplicate settlement protection
- reconnect snapshot
- stale websocket event
- client cannot force result
- client cannot claim payout directly

## Bridge
- wrong origin ignored
- wrong source ignored
- wrong session ignored
- malformed payload ignored
- unknown message type ignored
- fake balance/payout message ignored

## Release smoke test
1. Login.
2. Refresh app.
3. Verify server wallet.
4. Create a deposit order.
5. Complete provider payment in test mode.
6. Verify webhook credits exactly once.
7. Open 7UP-DOWN.
8. Place a valid bet.
9. Confirm server debit.
10. Wait for authoritative result.
11. Confirm server settlement.
12. Reconnect.
13. Confirm balances/history match server.
14. Request withdrawal.
15. Confirm UI shows pending until provider confirms.
