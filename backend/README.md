# Chat System — Backend

Node.js **Express** API with **PostgreSQL** (Prisma), **Socket.IO** realtime, optional **Redis** for multi-node sockets, and optional **Web Push / FCM** for notifications.

## Overview

| Layer | Technology |
|--------|------------|
| Runtime | Node.js ≥ 20 (ESM) |
| HTTP | Express 4 |
| Database | PostgreSQL + Prisma ORM |
| Realtime | Socket.IO 4 (JWT on connect) |
| Auth | Access JWT (Bearer) + refresh token (httpOnly cookie + JSON body fallback) |
| Validation | Zod (REST bodies + socket payloads) |
| IDs | `crypto.randomUUID()` (no `uuid` package) |
| Docs | OpenAPI at `/api/v1/openapi.json`, Swagger UI at `/api/docs` (dev by default) |

## Repository structure

```
backend/
├── prisma/
│   ├── schema.prisma       # User, Chat, Message, Calls, …
│   └── migrations/
├── scripts/                # Seed, cleanup uploads, clear chat data
├── src/
│   ├── app.ts              # Express factory (middleware, /api/v1)
│   ├── server.ts           # HTTP + Socket.IO + graceful shutdown
│   ├── config/             # Env → typed AppConfig (Zod)
│   ├── routes/index.ts     # Composes all /api/v1 routers
│   ├── middleware/         # auth (Bearer + optional query token), rate-limit, errors
│   ├── docs/               # OpenAPI + Swagger UI
│   ├── lib/                # prisma, jwt, push, uploads, user-display-name, …
│   ├── modules/            # Feature modules (routes + controller + service + schemas)
│   │   ├── auth/
│   │   ├── health/
│   │   ├── users/
│   │   ├── chats/          # Large chats.service.ts (messages, groups, receipts, list)
│   │   ├── messages/
│   │   ├── groups/         # Thin alias over chats for group creation
│   │   ├── friends/
│   │   ├── polls/
│   │   ├── files/          # Authorized download (?token= for <img src>)
│   │   ├── uploads/
│   │   ├── devices/        # Web Push / FCM registration
│   │   ├── calls/
│   │   └── moderation/
│   └── sockets/
│       ├── index.ts        # io, CORS, optional Redis adapter
│       ├── handlers.ts     # Connection + event wiring
│       ├── handlers-shared.ts  # ack helpers, reconnect delivery flush
│       ├── schemas.ts        # Zod socket payloads
│       ├── chat-broadcast.ts, message-broadcast.ts, calls-state.ts, …
│       └── *.integration.test.ts
└── package.json
```

**Shared utilities:** `backend/shared/http-url.ts` (link preview URL parsing) — keep in sync with `frontend/shared/http-url.ts`.

## Quick start

1. **PostgreSQL** — create a database; set `DATABASE_URL` in `.env` (copy from `.env.example`).

2. **Install & migrate**

   ```bash
   npm install
   npm run db:generate
   npm run db:migrate:dev    # development
   # npm run db:migrate     # production deploy
   ```

3. **Run**

   ```bash
   npm run dev               # tsx watch src/server.ts
   ```

   Default: `http://0.0.0.0:4000` (`HOST` + `PORT` from env).

4. **API base path** — all REST routes under **`/api/v1`**.

**Dev seed** (optional dummy users/groups):

```bash
npm run db:seed-test
# Remove later: CONFIRM=YES npm run db:remove-seed
```

## REST API surface (summary)

Routers are mounted in `src/routes/index.ts`.

| Prefix | Purpose |
|--------|---------|
| `GET /api/v1/health` | Liveness |
| `GET /api/v1/openapi.json` | OpenAPI spec |
| `GET /api/v1/config/public` | Public config (e.g. VAPID key) |
| `/api/v1/auth/*` | Register, login, refresh, logout, forgot/reset password |
| `/api/v1/users/*` | Search, profiles |
| `/api/v1/chats/*` | List/create, messages, mute, favorite, close, pin, polls |
| `/api/v1/messages/*` | Edit, delete, reactions |
| `/api/v1/groups/*` | Group create (delegates to chats service), members, roles |
| `/api/v1/friends/*` | Friend requests |
| `/api/v1/polls/*` | Poll fetch & vote |
| `/api/v1/files/*` | Authorized file download (Bearer or `?token=`) |
| `/api/v1/uploads/*` | Multipart upload pipeline |
| `/api/v1/devices/*` | Push device tokens |
| `/api/v1/calls/history` | Call logs |
| `/api/v1/moderation/*` | Block, report |

**Detail:** Swagger at **`/api/docs`** when enabled, or `src/docs/openapi.ts`.

### Chat member preferences (REST)

| Endpoint | Body | Notes |
|----------|------|--------|
| `PATCH /api/v1/chats/:chatId/favorite` | `{ favorited: boolean }` | DMs and groups |
| `PATCH /api/v1/chats/:chatId/close` | `{ closed: boolean }` | DMs only; cleared on new message |
| `PATCH /api/v1/chats/:chatId/pin` | `{ pinned: boolean }` | |
| `PATCH /api/v1/chats/:chatId/mute` | `{ mutedUntil: string \| null }` | |

Leave group: `DELETE /api/v1/groups/:groupId/members/:userId` (self-leave allowed).

## Socket.IO (realtime)

- **Path:** `/socket.io` on the same host as the API.
- **Auth:** `handshake.auth.token` or `Authorization: Bearer <accessToken>`.
- **Server → client (examples):** `session:ready`, `message:new`, `message:updated`, `message:deleted`, `reaction:*`, `receipt:*`, `typing:update`, `presence:changed`, `call:*`, `groupCall:*`.
- **Client → server (examples):** `message:send`, `receipt:delivered`, `receipt:read`, `typing:start` / `typing:stop`, `presence:update`, `call:offer` / `answer` / `reject` / `end` / `ice`, `groupCall:start` / `join` / `leave` / `signal` (many use ack callbacks `{ ok, data } | { ok: false, code, message }`).

Implementation: `src/sockets/handlers.ts`, payloads in `src/sockets/schemas.ts`, shared ack/reconnect helpers in `handlers-shared.ts`. Optional **Redis** (`REDIS_URL`) for `@socket.io/redis-adapter`.

## Core functionality

- **Accounts:** email/password, JWT sessions, SMTP password reset (optional).
- **Chats:** direct + group, roles, public/private visibility, favorites, close DM, pin, mute, unread counts.
- **Messages:** Plaintext body in `ciphertext`, attachments, replies, edits, soft delete, reactions, mentions.
- **Groups:** create, members, roles, public join, system activity messages via `group-system-message.ts`.
- **Friends:** request / accept / reject (API ready).
- **Polls:** create, vote, tallies.
- **Uploads:** validated types/sizes, disk storage under `UPLOAD_DIR`.
- **Push:** Web Push (VAPID) and/or FCM; mention-aware routing.
- **Calls:** 1:1 + group signaling; `CallLog` + system messages for history.
- **Search & previews:** in-chat ILIKE search; SSRF-safe link preview.

## Shared libraries (selected)

| Module | Role |
|--------|------|
| `lib/user-display-name.ts` | Single display-name resolver (chats, calls, group activity) |
| `lib/validate-access-token.ts` | JWT verify + `authVersion` check |
| `middleware/auth.ts` | `createRequireAuth`, `createRequireAuthOrQueryToken` (files) |
| `lib/receipt-status.ts` | Message receipt status derivation |
| `lib/notification-router.ts` | Push routing with mention awareness |

## Environment variables

See **`.env.example`**. Important entries:

| Variable | Role |
|----------|------|
| `DATABASE_URL` | PostgreSQL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing |
| `PORT`, `HOST` | HTTP + Socket.IO bind |
| `CORS_ORIGIN` | Browser origin(s); add LAN URL for mobile dev |
| `FRONTEND_URL` | Password-reset links |
| `REFRESH_COOKIE_NAME` | httpOnly refresh cookie |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | File storage |
| `REDIS_URL` | Optional Socket.IO scale-out + presence |
| `VAPID_*` / FCM vars | Optional push |
| `SMTP_*` | Optional email (forgot password) |
| `ENABLE_SWAGGER` | Expose `/api/docs` in production if set |

## NPM scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode (`tsx watch src/server.ts`) |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/src/server.js` |
| `npm run lint` | ESLint `src` |
| `npm run db:generate` | Prisma client |
| `npm run db:migrate:dev` | Dev migrations |
| `npm run db:migrate` | Deploy migrations |
| `npm run db:push` | Schema push (prototyping) |
| `npm test` | Vitest unit/integration tests |
| `npm run test:integration` | Auth integration test |
| `npm run test:socket` | Socket integration test |
| `npm run cleanup-uploads` | Orphan upload maintenance |
| `npm run db:seed-test` | Dev dummy data |
| `npm run db:remove-seed` | Remove seed (`CONFIRM=YES`) |
| `npm run db:clear-chats` | Wipe chat/message data (destructive) |

## Testing

- **Vitest:** `src/**/*.test.ts`, `*.integration.test.ts`.
- Run focused suites: `npm run test:integration`, `npm run test:socket`.

Some unit tests use Prisma mocks; a few suites may need mock updates when schema or access helpers change.

## Security notes

- Secrets in `.env` only — never commit real credentials.
- Rate limits on auth routes (configurable).
- Helmet, CORS, structured logging with request IDs.
- Refresh tokens hashed at rest; short-lived access tokens.
- File downloads require auth (header or query token) + membership check.

## Related

- [../docs/README.md](../docs/README.md) — Project overview & quick start
- [../frontend/README.md](../frontend/README.md) — SPA, themes, PWA
- [../docs/INTEGRATION.md](../docs/INTEGRATION.md) — Auth, proxy, socket contract
- [../docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) — Full dev setup
- [../docs/CODEBASE_FEATURE_ANALYSIS.md](../docs/CODEBASE_FEATURE_ANALYSIS.md) — Feature matrix
- [../docs/coturn.md](../docs/coturn.md) — TURN for WebRTC
