## Sprint 9: Production hardening checklist

### WebRTC / calling
- **TURN**: deploy coturn; require TURN for mobile/NAT-restricted networks.
- **Credentials**: use short-lived TURN creds; never hardcode long-lived shared secrets in clients.
- **Signaling**: never log SDP or ICE candidates; treat them as sensitive (IP/device/network fingerprinting).
- **DoS controls**: strict limits on `call:offer` and `call:ice`; per-call caps on ICE candidates.

### Moderation
- Enforce blocks at all entrypoints: DM create/send, call signaling, friend requests.
- Reports must validate reporter visibility (chat membership) and store immutable report payload.

### Logs (audit-friendly)
- Structured logs keyed by `requestId` / `userId` / `chatId` / `callId`.
- Explicit redaction for: tokens, SDP, ICE candidates, ciphertext, email codes.

### Deployment (multi-node)
- Enable Socket.IO Redis adapter for fan-out.
- If multiple nodes handle calls, use a shared coordination store (Redis lease) for call ownership/timeouts.

### Shutdown
- On graceful shutdown, mark active calls as ended/failed and notify participants.

