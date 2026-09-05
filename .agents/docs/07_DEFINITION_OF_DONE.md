# Production Definition of Done

A workstream is DONE only when all relevant boxes are true.

## Security
- [ ] No sensitive route uses optional auth when identity is required.
- [ ] No controller trusts client userId for authorization.
- [ ] JWT secret has no production fallback.
- [ ] Google identity is verified server-side.
- [ ] OTP uses secure randomness, hashing, attempts and provider delivery.
- [ ] Socket connections are authenticated.
- [ ] Private socket rooms are server-derived.
- [ ] HTTP and Socket.IO CORS are explicit allowlists.
- [ ] iframe bridge validates origin/source/schema/session.

## Wallet
- [ ] All money is integer paise.
- [ ] Every mutation is atomic.
- [ ] Affected-row/version checks exist.
- [ ] Idempotency keys are mandatory and unique per user/operation.
- [ ] Duplicate requests cannot double-credit/debit.
- [ ] Ledger records explicit deltas and references.
- [ ] Deposit credits happen only after verified provider webhook.
- [ ] Withdrawal uses a server-owned state machine.
- [ ] UI distinguishes pending/success/failure.

## 7UP-DOWN
- [ ] Backend is sole result authority.
- [ ] Frontend contains no gameplay RNG.
- [ ] Provably-fair result derives from committed seed.
- [ ] Algorithm is versioned and has known-vector tests.
- [ ] Bet API contract matches frontend exactly.
- [ ] Round timing is server-authoritative.
- [ ] Settlement is atomic/idempotent.
- [ ] Reconnect snapshot works.

## Flutter
- [ ] No invalid Dart syntax.
- [ ] Canonical API layer is used.
- [ ] Legacy `ApiService` is removed after migration.
- [ ] Logout clears token/session.
- [ ] No fake wallet/auth fallback.

## Product integrity
- [ ] No hardcoded live-looking online/player counts.
- [ ] No hardcoded transaction IDs.
- [ ] No fake payment success.
- [ ] No fake game payout.
- [ ] Fruit Slice is a real game or is removed/disabled.

## Verification
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Concurrency/idempotency tests pass.
- [ ] Release build succeeds.
- [ ] Production environment variables are documented.
- [ ] Database backup/recovery procedure is documented and tested.
- [ ] Payment webhook recovery/replay behavior is tested.
