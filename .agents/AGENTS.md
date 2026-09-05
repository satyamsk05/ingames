# InGames Agent Instructions

## Mission
Make this repository production-ready for the intended InGames Flutter + Node.js + HTML5/PixiJS gaming stack. Do not preserve fake/demo financial or game behavior.

## Read first
1. `.agent/PROJECT_CONTEXT.md`
2. `docs/00_MASTER_REMEDIATION.md`
3. `docs/01_AUTH_SECURITY.md`
4. `docs/02_WALLET_PAYMENTS.md`
5. `docs/03_7UPDOWN.md`
6. `docs/04_GAME_BRIDGE.md`
7. `docs/05_ARCHITECTURE.md`
8. `docs/06_TEST_PLAN.md`
9. `docs/07_DEFINITION_OF_DONE.md`

## Non-negotiable rules
- Server is authoritative for identity, wallet balances, bets, game rounds, results and payouts.
- Never trust client-supplied userId for authorization.
- Never trust client-supplied balance, winnings, payout, score, dice result or transaction status.
- Never credit a deposit merely because the client says payment succeeded. Credit only after verified provider webhook/callback.
- Every money-moving operation must be atomic and idempotent.
- Every private Socket.IO room must be derived from authenticated identity, not a client-provided room/userId.
- Every iframe postMessage must validate origin, source, schema, message type, version and game session.
- Remove demo fallbacks and hardcoded live-looking numbers.
- Do not create a second legacy API layer. Migrate to the canonical `lib/core` + `lib/features/*/data` architecture.
- Do not add a workaround that hides an API contract mismatch. Fix the contract at both sides.
- For 7UP-DOWN, backend generates/commits the result; frontend only animates the authoritative result.
- Do not claim a feature is tested unless the test actually executes it.

## Canonical commands
Backend:
```bash
cd backend
npm ci
npm run start
```

Static JS syntax check:
```bash
find backend/public/games -name '*.js' -print0 | xargs -0 -n1 node --check
```

Flutter (on a machine with Flutter installed):
```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --release
```

## Change discipline
- Prefer small, reviewable commits.
- Update the relevant docs when an API contract, state machine, schema or security boundary changes.
- Add/modify tests with every financial or authorization change.
- Keep secrets out of git.
- If an external payment/SMS/Google provider is not configured, implement an explicit adapter interface and fail safely; never simulate success in production.

## Known baseline defects
See the detailed docs. Important current defects include a Dart syntax error in `lib/services/api_service.dart`, unsafe Google login, weak OTP, optional-auth user spoofing, fake/direct deposit crediting, premature withdrawal success UI, client/server 7UP-DOWN contract mismatch, client RNG, invalid provably-fair design, unauthorized Socket.IO rooms, unvalidated iframe messages, hardcoded live metrics, and a non-game Fruit Slice page.
