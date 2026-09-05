# Flutter <-> HTML5 Game Bridge Security Specification

## Threat
`window.onMessage` currently forwards arbitrary messages without proving that the message came from the expected iframe/game session.

## Session handshake
When opening a game:
1. Backend creates a short-lived game session token tied to authenticated user + game + expiry.
2. Flutter loads the game URL with the session context.
3. Game sends `GAME_READY` with `sessionId`.
4. Flutter accepts only from the expected iframe origin/source.

Message schema:
```json
{
  "source": "ingames-game",
  "version": 1,
  "type": "GAME_READY",
  "sessionId": "gs_123",
  "payload": {}
}
```

## Flutter web listener requirements
Conceptual validation:
```dart
void handleMessage(MessageEvent event) {
  if (event.origin != expectedOrigin) return;
  if (event.source != iframe.contentWindow) return;

  final data = parseKnownMessage(event.data);
  if (data == null) return;
  if (data.source != 'ingames-game') return;
  if (data.version != 1) return;
  if (data.sessionId != currentSessionId) return;

  switch (data.type) {
    case 'GAME_READY':
    case 'GAME_STATE':
    case 'ROUND_RESULT':
      handleKnownMessage(data);
      break;
    default:
      return;
  }
}
```

Use the actual `package:web` APIs/types available in the project; the snippet is a contract, not copy-paste guarantee.

## Message rules
Allowed examples:
- `GAME_READY`
- `ROUND_SNAPSHOT`
- `BET_ACCEPTED`
- `ROUND_RESULT`
- `GAME_ERROR`

Forbidden client-authoritative fields:
- balance
- winnings
- payout amount
- userId
- wallet transaction status
- settlement status

If the game needs balance, request it from backend/session state and treat the returned server state as authoritative.

## Origin configuration
Never use `*` in production for the trusted game parent/child bridge. Use an exact HTTPS allowlist.

## Navigation/security
- reject unexpected iframe navigation where possible
- use HTTPS only in production
- set appropriate `Content-Security-Policy` / `frame-ancestors` policy after deployment architecture is finalized
- do not expose private JWTs to third-party origins
