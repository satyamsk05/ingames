# Wallet, Ledger, Deposit & Withdrawal Fix Specification

## Principle
The ledger is the source of truth. UI is a projection of server state.

## 1. Money units
Use integer paise everywhere in backend/database:
```js
const paise = Math.round(amountRupees * 100);
```
Prefer receiving `amountPaise` from trusted server-created orders or validated API inputs, with strict integer checks.

Never use floating point for ledger math.

## 2. Idempotency
Every money mutation requires a UUID idempotency key.

Schema requirement:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_user_idempotency
ON ledger_entries(user_id, idempotency_key);
```

Before mutation:
```js
const existing = db.prepare(`
  SELECT * FROM ledger_entries
  WHERE user_id = ? AND idempotency_key = ?
`).get(userId, idempotencyKey);

if (existing) return existing;
```

If the same key arrives with a different operation/amount, reject it as `IDEMPOTENCY_KEY_REUSE`.

Do not generate fallback idempotency keys with `Date.now()`.

## 3. Atomic wallet mutation
All balance changes must occur in one SQLite transaction. Check affected rows:
```js
const result = db.prepare(`
  UPDATE wallets
  SET balance_paise = ?, version = version + 1, updated_at = ?
  WHERE user_id = ? AND version = ?
`).run(nextBalance, now, userId, expectedVersion);

if (result.changes !== 1) {
  throw new Error('WALLET_CONFLICT');
}
```

For concurrent withdrawals/bets, retry safely or return a conflict. Never allow negative spendable balance.

## 4. Ledger columns
For reconciliation, store explicit deltas where applicable:
```text
delta_cash_paise
delta_winnings_paise
delta_bonus_paise
delta_locked_paise
balance_before_paise
balance_after_paise
reference_type
reference_id
idempotency_key
metadata_json
created_at
```

## 5. Deposit state machine
```text
CREATED -> PENDING_PROVIDER -> SUCCEEDED
                         |-> FAILED
                         |-> EXPIRED
```

Client request creates an order only:
```http
POST /api/wallet/deposits/orders
Authorization: Bearer <token>
Idempotency-Key: <uuid>
```

Response contains a provider order/payment identifier. The app then launches the provider checkout.

Only a verified provider webhook may move the order to `SUCCEEDED` and credit the ledger.

Webhook requirements:
- verify signature
- verify event type
- verify provider transaction ID
- verify expected amount and currency
- bind payment to the internal order/user
- reject duplicates safely
- record raw event ID for idempotency
- never trust client success callbacks as settlement proof

## 6. Withdrawal
Server owns fee/cashback calculation. Client sends only requested amount and destination reference.

Example:
```json
{
  "amountPaise": 50000,
  "destinationId": "bank_or_upi_token",
  "idempotencyKey": "uuid"
}
```

Do not accept client-calculated fee/cashback.

UI status mapping:
```text
REQUESTED/PROCESSING -> "Withdrawal pending"
PAID                  -> "Withdrawal successful"
FAILED/REVERSED      -> "Withdrawal failed"
```

Never show success immediately after receiving a `PENDING` server response.

## 7. Transaction IDs
Remove hardcoded transaction IDs from Flutter. Render the server transaction/reference ID.

## 8. Wallet refresh
After any mutation, return authoritative wallet summary and emit a user-scoped websocket update. The client may optimistically disable a button, but must reconcile with the server response.

## 9. Required financial tests
- ₹100 wallet, concurrent ₹80 + ₹80: exactly one succeeds
- duplicate deposit webhook: one credit only
- duplicate withdrawal request: one request only
- duplicate bet: one debit only
- insufficient balance: no ledger mutation
- failed payment: no wallet credit
- failed withdrawal: reserved funds restored exactly once
- idempotency key reused with different amount: rejected
