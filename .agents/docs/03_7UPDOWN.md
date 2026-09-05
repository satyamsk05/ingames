# 7UP-DOWN Server-Authoritative Game Specification

## 1. State machine
```text
ROUND_CREATED
  -> BETTING_OPEN
  -> BETTING_CLOSED
  -> RESULT_GENERATED
  -> SETTLEMENT
  -> FINISHED
```

Allowed transitions must be enforced by the backend. A timer alone is not the authority.

## 2. Result authority
Frontend must NOT generate dice.

Delete/stop using:
```js
export function getRandomDiceRoll() {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return { d1, d2, total: d1 + d2 };
}
```

Replace with a display helper that consumes server result:
```js
export function normalizeDiceResult(payload) {
  if (!payload || !Number.isInteger(payload.dice1) || !Number.isInteger(payload.dice2)) {
    throw new Error('INVALID_SERVER_RESULT');
  }
  if (payload.dice1 < 1 || payload.dice1 > 6 || payload.dice2 < 1 || payload.dice2 > 6) {
    throw new Error('INVALID_SERVER_RESULT');
  }
  return {
    d1: payload.dice1,
    d2: payload.dice2,
    total: payload.dice1 + payload.dice2,
  };
}
```

## 3. Provably-fair algorithm
The server commits to `SHA256(serverSeed)` before betting. The final dice must be derived deterministically from `serverSeed` and frozen round data.

Reference implementation:
```js
function deriveDice({ serverSeed, roundId, roundNumber }) {
  const message = `${roundId}:${roundNumber}:0`;
  const digest = crypto
    .createHmac('sha256', serverSeed)
    .update(message)
    .digest('hex');

  return {
    dice1: (parseInt(digest.slice(0, 8), 16) % 6) + 1,
    dice2: (parseInt(digest.slice(8, 16), 16) % 6) + 1,
  };
}
```

The exact algorithm, field order and encoding must not change after release without a versioned protocol. Store `fairness_version` with the round.

After result, expose the server seed so a verifier can recompute the commitment and dice.

## 4. Bet contract
Backend accepts:
```json
{
  "roundId": "rnd_x",
  "betType": "UP|DOWN|SEVEN",
  "stakeAmountPaise": 1000,
  "idempotencyKey": "uuid"
}
```

If number bets such as 2/3/4/5/6/8/9/10/11/12 are required by the UI, explicitly add them to the backend enum and define exact payout multipliers. Do not send a human-readable summary string as `betType`.

## 5. Round timing
Use server timestamps in ISO format. Frontend countdown is display-only.

Frontend should calculate:
```js
const remainingMs = Math.max(0, new Date(round.bettingCloseAt).getTime() - Date.now());
```

Do not maintain a second hardcoded `12s`/`15s` authority.

## 6. Settlement
Settlement is backend-only and idempotent:
```js
const tx = db.transaction(() => {
  const bets = getAcceptedBets(roundId);
  for (const bet of bets) {
    // Determine outcome from stored round result.
    // Credit winnings exactly once.
    // Mark bet WON/LOST with settlement reference.
  }
  markRoundSettled(roundId);
});
tx();
```

Do not call `/claim-winnings` from the game client for normal round settlement.

## 7. Failure behavior
If bet placement fails, frontend must not animate it as accepted. If result is missing, frontend shows reconnect/result-pending state and fetches the round snapshot.

## 8. Reconnect
Required endpoint:
```http
GET /api/games/7updown/current-round
Authorization: Bearer <token>
```

Required websocket events should carry a monotonic event/version or enough round state for stale events to be ignored.

## 9. Required tests
- bet accepted before close
- bet rejected after close
- wrong round rejected
- duplicate idempotency key returns same result
- concurrent duplicate bet does not double-debit
- deterministic known seed -> known dice
- result cannot be changed after `RESULT_GENERATED`
- every accepted bet settles exactly once
- reconnect gets correct current round
- stale websocket result is ignored
