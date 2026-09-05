PROJECT:
satyamsk05/ingame

GOAL:
Is repository ko production-grade architecture mein convert karo.
Existing UI/design ko unnecessarily mat todo.
Existing functionality ko preserve karo, lekin architecture, security,
state management, wallet, transactions, authentication, HTML5 game
integration aur backend synchronization ko properly rebuild/fix karo.

IMPORTANT:
Repository ko pehle COMPLETE scan karo:
- Flutter/Dart
- HTML
- CSS
- JavaScript/PixiJS
- backend
- database
- configuration
- assets
- Android/iOS/Web configuration
- environment files
- authentication
- payment/deposit/withdrawal
- game/bet logic
- WebView/iframe bridge
- API endpoints
- WebSocket
- local storage
- hardcoded data
- fallback/mock/demo logic

Kisi issue ko sirf hide/ignore mat karo.
Root cause fix karo.

==================================================
1. ARCHITECTURE
==================================================

CURRENT PROBLEM:
main.dart bahut saara application state handle kar raha hai:
- login
- home
- profile
- wallet
- withdrawal
- transactions
- settings
- help
- game
- balance
- navigation

FIX:

main.dart sirf application bootstrap kare.

Create:

lib/
  app/
  core/
  models/
  services/
  features/

Use feature-based architecture.

Separate:
- auth
- home
- wallet
- deposit
- withdrawal
- transactions
- bets
- games
- profile
- notifications
- support
- settings

Navigation ko centralized router mein rakho.

Screen-to-screen boolean flags:
_isProfilePageActive
_isWithdrawPageActive
_isTransactionsPageActive
_isHtml5GameActive
etc.

REMOVE karo.

Use proper Navigator/router based navigation.

==================================================
2. AUTHENTICATION
==================================================

CURRENT PROBLEM:
Google login failure ke case mein fake success/token/user/balance return ho raha hai.

Example:
jwt_google_token_local
depositBalance: 800
winningsBalance: 450

THIS MUST NEVER EXIST IN PRODUCTION.

FIX:
- backend authentication authoritative ho
- invalid backend response = login failure
- network failure = login failure/offline state
- fake token NEVER generate
- fake balance NEVER generate
- demo user NEVER silently create
- access token secure storage mein rakho
- refresh token/session mechanism implement karo
- logout par tokens clear karo
- token expiry handle karo
- unauthorized response par refresh/re-login
- user identity server-side verify karo

Google:
Flutter Google credential → backend → backend verifies credential
→ backend creates/loads user → backend issues app session.

Client supplied:
email/name/picture ko blindly trusted identity mat mano.

OTP:
- OTP server generate kare
- OTP expiry
- attempt limit
- resend cooldown
- rate limit
- verification server-side
- OTP logs mein plaintext mat rakho
- successful OTP ke baad authenticated session issue karo.

==================================================
3. API CLIENT
==================================================

CURRENT PROBLEM:
Ek huge ApiService mein saare APIs mixed hain.

FIX:

lib/core/api/
  api_client.dart
  api_endpoints.dart
  api_exception.dart
  auth_interceptor.dart

features/*/data/
  auth_api.dart
  wallet_api.dart
  game_api.dart
  transaction_api.dart
  etc.

Central ApiClient:
- base URL
- headers
- auth token
- timeout
- retry policy
- status code handling
- JSON parsing
- logging (without secrets)
- refresh token
- common errors

REMOVE:
multiple production fallback URLs.

Do not silently switch between:
localhost
127.0.0.1
10.0.2.2
production

Use environments:

.env/dev
.env/staging
.env/prod

Never hardcode secrets.

==================================================
4. WALLET
==================================================

THIS IS CRITICAL.

CURRENT PROBLEM:
Client contains:
_depositBalance
_winningsBalance
_rewardsBalance

Client-side values must NOT be authoritative.

FIX:

Backend is the ONLY source of truth.

Wallet model:

wallet_id
user_id
cash_balance
winnings_balance
bonus_balance
locked_balance
currency
version
created_at
updated_at

But DO NOT update balance by arbitrary client requests.

Every money movement must create immutable ledger entry.

Create:

wallet_ledger

Fields:
id
user_id
wallet_id
reference_type
reference_id
direction
amount
balance_before
balance_after
currency
status
metadata
created_at

Balance update must be atomic.

Use database transaction.

Never:
balance = balance + amount

without transaction/locking/idempotency.

==================================================
5. DEPOSIT
==================================================

Client must NEVER directly credit wallet.

Flow:

Flutter
→ create deposit intent
→ backend creates pending deposit
→ payment provider
→ provider callback/webhook
→ backend verifies payment
→ backend checks amount/reference/status
→ transaction DB lock
→ credit wallet
→ ledger entry
→ transaction record
→ emit wallet.updated

Webhook must be idempotent.

Same payment callback 2 times:
wallet MUST NOT be credited twice.

Deposit statuses:

PENDING
SUCCESS
FAILED
EXPIRED
CANCELLED
REFUNDED

Client payment success screen alone must NOT credit wallet.

==================================================
6. WITHDRAWAL
==================================================

Flow:

Flutter
→ withdrawal request
→ backend validates balance
→ lock required amount
→ create withdrawal
→ ledger entry
→ admin/payment processing
→ final status
→ unlock/deduct appropriately

Statuses:

PENDING
PROCESSING
SUCCESS
FAILED
CANCELLED
REVERSED

Never trust client supplied balance.

Never allow:
withdraw amount > available balance.

Prevent duplicate withdrawal request using idempotency key.

Validate UPI/bank details server-side.

Store sensitive payment data securely.

==================================================
7. TRANSACTIONS
==================================================

CURRENT PROBLEM:
Hardcoded transaction entries exist in main.dart.

REMOVE ALL hardcoded financial transaction data.

Transactions must come from backend.

Create:

transactions/
  transaction_model.dart
  transaction_api.dart
  transaction_repository.dart
  transaction_controller.dart

Transaction types:

DEPOSIT
WITHDRAWAL
BET
WIN
REFUND
BONUS
ADJUSTMENT

Every transaction gets:
id
userId
type
amount
currency
status
referenceId
createdAt
description

Transaction history must be paginated.

Do not load unlimited records.

==================================================
8. BET SYSTEM
==================================================

CURRENT PROBLEM:
Client sends entryFee directly.

Example:
gameId + entryFee

DO NOT TRUST entryFee FROM CLIENT.

FIX:

Client sends:

gameId
roundId
selection
idempotencyKey

Server resolves:
- entry fee
- allowed selections
- odds/payout
- round state
- betting deadline
- user balance

Server validates everything.

Never accept:
client calculated payout
client calculated winnings
client calculated balance

==================================================
9. 7UP/DOWN GAME
==================================================

Game engine should only be presentation/input layer.

PixiJS:
- render dice
- animation
- timer
- buttons
- UI
- sound
- display result

Backend/game server:
- round creation
- round state
- betting open/close
- authoritative result
- bet validation
- settlement
- wallet update

Correct flow:

ROUND_CREATED
↓
BETTING_OPEN
↓
BET_PLACED
↓
BETTING_CLOSED
↓
RESULT_GENERATED
↓
RESULT_PUBLISHED
↓
SETTLEMENT
↓
ROUND_FINISHED

Client must NEVER determine authoritative outcome.

Do not generate real-money result solely in browser JavaScript.

==================================================
10. GAME ROUND
==================================================

Create:

game_rounds

Fields:

id
game_id
round_number
status
betting_open_at
betting_close_at
result
result_hash
server_seed_reference
created_at
closed_at

Round IDs must be unique.

Server controls round state.

Client timer is display only.

If client timer says 0 but server is still open:
server wins.

If client says betting open but server closed:
server rejects bet.

==================================================
11. FAIR RESULT / RNG
==================================================

If the product requires provably fair results:

Use server-side secure RNG / appropriate provably-fair design.

Never:
Math.random()

for authoritative real-money result.

Do not expose secret seed before round completion.

If using commit/reveal:
- commit hash before betting
- reveal seed after round
- client can verify result

Document exact formula.

==================================================
12. BET SETTLEMENT
==================================================

Settlement must be idempotent.

For each bet:

BET_ACCEPTED
→ amount locked/debited
→ result
→ WIN/LOSS
→ payout
→ ledger
→ transaction

If settlement job runs twice:
second execution must do NOTHING.

Use unique constraint/reference:
settlement_id / bet_id.

==================================================
13. HTML5 + PIXI.JS
==================================================

Current game is loaded through Html5GameScreen.

Improve architecture.

Create:

game/
  bridge/
  network/
  state/
  scenes/
  components/
  systems/

Do NOT parse messages using:

msgStr.contains(...)

Use structured JSON events.

Example:

{
  "type": "ROUND_RESULT",
  "payload": {
    ...
  }
}

Events:

GAME_READY
AUTH_READY
ROUND_STATE
BET_ACCEPTED
BET_REJECTED
ROUND_STARTED
BETTING_CLOSED
ROUND_RESULT
SETTLEMENT_COMPLETE
WALLET_UPDATED
GAME_ERROR
EXIT_GAME

Validate message origin/source.

Do not trust arbitrary window messages.

==================================================
14. FLUTTER ↔ GAME BRIDGE
==================================================

Create one formal bridge protocol.

Flutter → Pixi:

AUTH_TOKEN/session identifier
PLAYER_CONFIG
GAME_CONFIG
BALANCE_SNAPSHOT

Pixi → Flutter:

GAME_READY
BET_REQUEST
ROUND_RESULT
WALLET_UPDATED
EXIT_GAME

IMPORTANT:
Token ko unnecessarily JavaScript global/localStorage mein expose mat karo.

Prefer short-lived game session token generated by backend.

==================================================
15. BALANCE SYNC
==================================================

Current approach:
game sends wallet updated
Flutter calls getUserProfile

This is not enough.

Correct:

Backend
↓
wallet ledger transaction
↓
database commit
↓
WebSocket event
↓
Flutter + PixiJS

Event:

wallet.updated

payload:
walletVersion
availableBalance
lockedBalance
timestamp

Client ignores stale walletVersion.

Never let old WebSocket event overwrite newer balance.

==================================================
16. WEBSOCKET
==================================================

Implement:

connection manager
authentication
reconnect
heartbeat
ping/pong
subscription
unsubscribe
event validation
sequence/version

On reconnect:

DO NOT assume old state is correct.

Client requests:
GET current round
GET current wallet snapshot

then resumes WebSocket.

Handle:
connection lost
duplicate events
out-of-order events
server restart
reconnect

==================================================
17. IDEMPOTENCY
==================================================

Required for:

deposit
withdrawal
bet
settlement
refund

Client generates idempotency key.

Backend stores it with operation.

Same request twice:
return original result.

Never create second financial transaction.

==================================================
18. DATABASE
==================================================

Create proper relations.

Minimum:

users
sessions
wallets
wallet_ledger
deposits
withdrawals
games
game_rounds
bets
bet_selections
settlements
transactions
notifications
payment_webhooks
audit_logs

Use:
primary keys
foreign keys
unique indexes
indexes for user/date/status
database constraints

Financial amounts:
DO NOT use floating point.

Use integer minor units or DECIMAL/NUMERIC.

Example:
₹10.50 → 1050 paise

Never:
double amount

for authoritative money calculations.

==================================================
19. CONCURRENCY
==================================================

Test:

Two bets simultaneously.

Two withdrawals simultaneously.

Deposit webhook + user refresh simultaneously.

Two settlement workers simultaneously.

Two devices logged in simultaneously.

No race condition should allow:
negative balance
double payout
double deposit
double withdrawal
double settlement

Use DB transactions/locking/unique constraints.

==================================================
20. ERROR HANDLING
==================================================

Current code has many:

catch (_) {}

This hides real failures.

Replace with structured exceptions.

Never silently swallow:
authentication failure
payment failure
wallet failure
database failure
game failure

Show user-friendly message.

Log technical error server-side.

Do not expose:
stack traces
DB errors
tokens
secrets
internal URLs

==================================================
21. LOADING / OFFLINE
==================================================

Distinguish:

LOADING
SUCCESS
EMPTY
ERROR
OFFLINE

Do not use fake money/data as offline fallback.

Wallet offline:
show last known balance only as stale/read-only if desired,
never allow financial operation offline.

Bet:
must require live server connection.

==================================================
22. HOME SCREEN
==================================================

Home should consume repositories/controllers.

Home:
- profile
- balance
- games
- banners
- online count
- notifications

must NOT own wallet/business logic.

Example:

HomeController
→ UserRepository
→ WalletRepository
→ GameRepository

==================================================
23. PROFILE
==================================================

Profile updates must be server validated.

Username:
- length
- allowed characters
- uniqueness if required

Avatar:
- whitelist allowed assets or secure upload mechanism

Do not accept arbitrary local path as authoritative avatar identity.

==================================================
24. TRANSACTION DETAILS
==================================================

Create:

transaction_details_screen.dart

Display:
- transaction ID
- type
- amount
- status
- timestamp
- reference
- game/round/bet reference where applicable

Data comes from backend.

==================================================
25. BET HISTORY
==================================================

Create:
my_bets_screen
bet_details_screen

Show:
game
round
selection
stake
result
payout
status
timestamp

Pagination required.

==================================================
26. ADMIN
==================================================

If admin exists, secure it separately.

Admin:
- user management
- deposits
- withdrawals
- games
- rounds
- bets
- settlements
- transaction search
- reports
- audit logs

Never rely on:
isAdmin from Flutter.

Authorization MUST happen server-side.

RBAC:
ADMIN
SUPPORT
FINANCE
GAME_OPERATOR

etc.

==================================================
27. AUDIT LOG
==================================================

Every sensitive action:

login
logout
deposit
withdrawal
bet
settlement
refund
admin adjustment
profile/security change

should produce audit event.

Never allow users to edit audit logs.

==================================================
28. SECURITY
==================================================

Audit entire project for:

- hardcoded secrets
- API keys
- tokens
- passwords
- fake JWT
- test credentials
- debug endpoints
- unrestricted admin APIs
- CORS
- missing authorization
- IDOR
- SQL injection
- XSS
- CSRF where applicable
- replay attacks
- duplicate requests
- rate-limit bypass
- client-side balance manipulation
- client-side payout manipulation
- client-side result manipulation
- WebSocket authorization
- insecure WebView/iframe messaging

Remove secrets from repository.

Use environment variables / secret manager.

==================================================
29. RATE LIMITING
==================================================

Rate-limit:

OTP send
OTP verify
login
withdrawal
deposit creation
bet creation
profile updates
support submissions

Use IP + account/device appropriate controls.

==================================================
30. INPUT VALIDATION
==================================================

Never trust Flutter/PixiJS input.

Validate server-side:

userId
gameId
roundId
bet amount
selection
withdraw amount
payment reference
transaction reference

Reject unexpected fields where appropriate.

==================================================
31. API RESPONSE FORMAT
==================================================

Standardize:

{
  "success": true,
  "data": {},
  "error": null,
  "requestId": "..."
}

Error:

{
  "success": false,
  "data": null,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance"
  },
  "requestId": "..."
}

==================================================
32. LOGGING
==================================================

Backend logs:
- request ID
- user ID where safe
- endpoint
- status
- latency
- error code

Never log:
OTP
password
access token
refresh token
payment secrets
full sensitive bank information

==================================================
33. TESTING
==================================================

Create tests for:

AUTH
- valid login
- invalid OTP
- expired OTP
- OTP brute force
- logout
- expired token

WALLET
- deposit
- duplicate deposit webhook
- withdrawal
- concurrent withdrawal
- insufficient balance
- refund

BET
- valid bet
- invalid game
- closed round
- invalid amount
- duplicate bet
- concurrent bets

SETTLEMENT
- win
- loss
- duplicate settlement
- worker retry

WEBSOCKET
- disconnect
- reconnect
- stale event
- duplicate event

GAME
- round lifecycle
- timer mismatch
- result delivery

==================================================
34. REMOVE DEMO / MOCK / FAKE DATA
==================================================

Search entire repository for:

800
450
1250
jwt_google_token_local
Ashu K
89,156 online
Day 2 Reward
Cash Deposited
Won :
Entry Fee :
dummy
mock
fake
demo
fallback
localhost
127.0.0.1
10.0.2.2

Determine whether each occurrence is real functionality or demo code.

Remove production fake financial/auth data.

==================================================
35. ASSET STRUCTURE
==================================================

Normalize:

assets/
  images/
  icons/
  avatars/
  game/
  sounds/
  fonts/
  banners/

Fix:
Assets vs assets
Avatar vs avatar
duplicate directories
duplicate pubspec entries.

==================================================
36. GAME ASSET SECURITY
==================================================

Game assets can be public.

But:
- wallet logic
- payout formula
- authoritative result
- secret seed
- admin operations

must NEVER be shipped inside PixiJS bundle.

Assume every JavaScript file can be inspected by player.

==================================================
37. BUILD CONFIGURATION
==================================================

Separate:

development
staging
production

Production:
- debug disabled
- test payment disabled
- fake auth disabled
- fake wallet disabled
- localhost disabled
- verbose logging disabled

==================================================
38. DEPENDENCY AUDIT
==================================================

Check:
pubspec.yaml
package.json
lock files

Remove unused dependencies.

Update vulnerable dependencies where compatible.

Do not blindly upgrade everything if it breaks the project.

==================================================
39. DOCUMENTATION
==================================================

Create:

docs/
  architecture.md
  api.md
  auth.md
  wallet.md
  ledger.md
  deposits.md
  withdrawals.md
  game-flow.md
  websocket.md
  security.md
  deployment.md

Document every important flow.

==================================================
40. FINAL VERIFICATION
==================================================

After fixes:

flutter analyze
flutter test

Build Flutter.

Build HTML5/PixiJS.

Run backend tests.

Run integration tests.

Search again for:
- fake balances
- fake token
- hardcoded credentials
- swallowed exceptions
- client-side payout
- client-side authoritative result
- floating-point money
- duplicate transaction vulnerability
- missing authorization
- insecure postMessage handling
- localhost production URLs

Then provide a FINAL AUDIT REPORT:

1. Issue
2. File
3. Line/function
4. Severity
5. Root cause
6. Fix applied
7. Test performed
8. Remaining risk

DO NOT claim fixed unless code was actually changed and tested.

DO NOT modify UI unnecessarily.

DO NOT replace real functionality with mocks.

DO NOT add fake fallback behavior to make errors disappear.

The final system must have:
Backend = source of truth
Wallet = ledger based
Game result = server authoritative
Bet = server validated
Settlement = idempotent
Transactions = immutable financial records
Flutter = app/UI
PixiJS = game presentation/input
WebSocket = realtime synchronization