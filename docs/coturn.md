# coturn (TURN) for WebRTC calls

Direct peer connections often fail across strict NATs or mobile networks. Deploy **coturn** and point the frontend at it via `VITE_TURN_*` in `frontend/.env`.

## Docker (quick local test)

```yaml
# docker-compose.coturn.yml (example)
services:
  coturn:
    image: coturn/coturn:latest
    network_mode: host
    volumes:
      - ./turnserver.conf:/etc/coturn/turnserver.conf:ro
    command: ["-c", "/etc/coturn/turnserver.conf"]
```

## Minimal `turnserver.conf`

```ini
listening-port=3478
fingerprint
lt-cred-mech
user=chatuser:your-turn-password
realm=chat.local
```

Frontend `.env`:

```env
VITE_TURN_URL=turn:YOUR_PUBLIC_IP:3478
VITE_TURN_USERNAME=chatuser
VITE_TURN_CREDENTIAL=your-turn-password
```

## Production notes

- Open UDP/TCP **3478** (and TLS **5349** if using `turns:`).
- Prefer **short-lived TURN credentials** (REST API) instead of a static password in the client.
- Never log SDP or ICE candidates (see `backend/src/docs/sprint9-production-hardening.md`).
- STUN alone is enough for same-LAN dev; use TURN when testing phone LTE ↔ home Wi‑Fi.
