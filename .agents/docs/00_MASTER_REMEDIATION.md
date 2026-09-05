# InGames A2Z Production Remediation

## Goal
Replace demo/simulated behavior with a secure, server-authoritative production architecture without repeatedly rediscovering the same repository context.

## Priority order
1. Authentication/authorization
2. Wallet ledger + concurrency + idempotency
3. Real deposit provider + signed webhook
4. Withdrawal state machine
5. Server-authoritative 7UP-DOWN
6. Socket authentication
7. Flutter API migration
8. Secure HTML5 bridge
9. Fruit Slice implementation/removal
10. Tests and release hardening
11. Remove demo/static data

## Workstream A — Authentication
### Current defect
Sensitive routes use optional auth and may use a client-supplied userId.

### Required shape
```js
// auth middleware
const auth = requireAuth(req); // verifies JWT
req.user = { id: auth.sub };

// controller
const userId = req.user.id;
// NEVER: req.body.userId || req.query.userId
```

Change routes such as profile, wallet, transactions, join/bet and bet-history to authenticated middleware where user identity is required.

## Workstream B — Wallet
Use one atomic ledger transaction for each balance mutation.

Pseudo-transaction:
```js
const tx = db.transaction(() => {
  const wallet = getWalletForUpdate(userId);
  assertSufficientBalance(wallet, debitPaise);
  const updated = updateWalletAtomically(userId, debitPaise, expectedVersion);
  if (updated.changes !== 1) throw new Error('WALLET_CONFLICT');
  insertLedgerEntry({
    userId,
    referenceId,
    idempotencyKey,
    deltaCashPaise,
    deltaWinningsPaise,
    deltaBonusPaise,
    balanceBeforePaise,
    balanceAfterPaise,
  });
});
tx();
```

Idempotency must be `(user_id, idempotency_key)` unique. Reusing a key with a different amount/action must be rejected.

## Workstream C — Deposit
Correct flow:
```text
Flutter -> POST /wallet/deposits/order
Backend -> provider order/payment intent
Flutter -> provider checkout
Provider -> signed webhook -> Backend
Backend -> verify signature + amount + currency + provider ID
Backend -> idempotent ledger credit
Backend -> PAYMENT_SUCCEEDED event
```

Never do this:
```js
// WRONG
POST /wallet/add-cash { amount: 1000 }
// immediately credit wallet because client says payment succeeded
```

## Workstream D — Withdrawal
State machine:
```text
REQUESTED -> RISK_CHECK -> PROCESSING -> PAID
                              |-> FAILED
                              |-> REVERSED
```

When the user submits a withdrawal, reserve/lock funds atomically and show `Pending` until the server marks it paid. Release the reservation on failure/reversal.

## Workstream E — 7UP-DOWN
Canonical bet request:
```json
{
  "roundId": "rnd_...",
  "betType": "UP",
  "stakeAmountPaise": 1000,
  "idempotencyKey": "uuid"
}
```

Canonical result:
```json
{
  "roundId": "rnd_...",
  "roundNumber": 1001,
  "dice1": 4,
  "dice2": 2,
  "sum": 6,
  "winningOutcome": "DOWN"
}
```

Frontend must never call a claim-winnings endpoint for normal round settlement. Settlement is server-side and idempotent.

## Workstream F — Provably fair
Use the committed server seed to derive the result. Example deterministic construction:
```js
const message = `${roundId}:${roundNumber}:0`;
const digest = crypto
  .createHmac('sha256', serverSeed)
  .update(message)
  .digest('hex');

const n1 = parseInt(digest.slice(0, 8), 16) % 6 + 1;
const n2 = parseInt(digest.slice(8, 16), 16) % 6 + 1;
```

The exact algorithm must be frozen in `docs/03_7UPDOWN.md` and tested with known vectors before release. Do not use a new algorithm silently after users have relied on previous commitments.

## Workstream G — Socket security
Authenticate during handshake:
```js
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = verifyToken(token);
    next();
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
});

io.on('connection', socket => {
  socket.join(`user_${socket.user.id}`);
});
```

Remove `JOIN_USER_ROOM(userId)` entirely for private user rooms.

## Workstream H — iframe bridge
Accept only structured messages:
```js
{
  source: 'ingames-game',
  version: 1,
  type: 'GAME_READY',
  sessionId: 'gs_...'
}
```

Validate:
- `event.origin` against exact allowlist
- `event.source === iframe.contentWindow`
- object shape and primitive types
- supported `version`
- current `sessionId`
- allowed message type

Never accept balance/payout/user identity from iframe messages.

## Workstream I — Flutter architecture
Migrate screens to:
```text
UI -> feature API/repository -> ApiClient -> backend
UI <- state/controller <- repository
```

Delete `ApiService` only after all call sites are migrated and tests pass. Do not maintain duplicate auth/wallet/game implementations.

## Workstream J — Static/demo cleanup
Remove or replace:
- hardcoded `89,156 online`
- hardcoded `4520/1420` player counts
- fake PlayersPanel balances
- hardcoded default username `Ashu K`
- hardcoded transaction IDs
- hardcoded `35ms`
- local Google token fallback
- local wallet fallback

## Workstream K — Fruit Slice
Either implement a real game with a server-defined game contract or remove/disable its game card and route. Do not ship a plan document as a playable page.

## Release gate
No production release until all items in `docs/07_DEFINITION_OF_DONE.md` are green.
