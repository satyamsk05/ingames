# Target Architecture

## Flutter
```text
lib/
  core/
    api/
      api_client.dart
    storage/
      token_manager.dart
  features/
    auth/
      data/auth_api.dart
      presentation/...
    wallet/
      data/wallet_api.dart
      presentation/...
    game/
      data/game_api.dart
      presentation/...
  screens/             # temporary UI layer during migration
  widgets/
```

Rules:
- UI does not build raw HTTP requests.
- API models are typed where practical.
- Token handling is centralized.
- Wallet state has one source of truth.
- Remove `lib/services/api_service.dart` after migration.

## Backend
```text
backend/src/
  core/
    auth_middleware.js
    api_response.js
    errors.js
    idempotency.js
  modules/
    auth/
    wallet/
      wallet.controller.js
      wallet.service.js
      ledger.service.js
      payment/
    game/
      game.controller.js
      seven_up_down.service.js
  routes.js
```

Add provider adapters rather than putting gateway logic in controllers:
```text
wallet/payment/
  payment.provider.js
  razorpay.provider.js   # or actual chosen provider
  webhook.service.js
```

## Database
SQLite is acceptable for a controlled single-instance prototype, but production scale/high-value financial workloads require a deliberate durability/concurrency/backup strategy. If staying on SQLite, document locking, WAL mode, backup and single-writer deployment assumptions. Do not pretend it is horizontally safe by default.

## API conventions
Success:
```json
{
  "status": "success",
  "data": {}
}
```

Error:
```json
{
  "status": "error",
  "error": {
    "code": "BETTING_CLOSED",
    "message": "Betting is closed"
  }
}
```

Never return stack traces or secret/internal details to clients.

## Observability
Every request should have a correlation/request ID. Financial operations should log:
- request ID
- authenticated user ID
- operation type
- reference ID
- idempotency key hash/reference
- result state
- duration

Never log OTPs, JWTs, payment secrets or full sensitive credentials.
