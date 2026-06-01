# Mernchat - Backend

Node.js **Express** API with **PostgreSQL** (Prisma), **Socket.IO** realtime, optional **Redis** for multi-node sockets, and optional **Web Push / FCM** for notifications.

## Overview

| Layer | Technology |
|--------|------------|
| Runtime | Node.js ≥ 20 (ESM) |
| HTTP | Express 4 |
| Database | PostgreSQL + Prisma ORM |
| Realtime | Socket.IO 4 (JWT on connect) |
| Auth | Access JWT (Bearer) + refresh token (httpOnly cookie + body fallback) |
| Validation | Zod (request bodies / socket payloads) |
| Docs | OpenAPI JSON at `/api/v1/openapi.json`, Swagger UI at `/api/docs` (dev by default) |

## Repository structure

```
backend/
├── prisma/
│   ├── schema.prisma      # Data model (User, Chat, Message, E2EE, Calls, …)
│   └── migrations/        # SQL migrations
├── scripts/               # Maintenance (e.g. orphan uploads cleanup)
├── src/
│   ├── app.ts             # Express app factory (middleware, `/api/v1` mount)
│   ├── server.ts          # HTTP server + Socket.IO bootstrap + graceful shutdown
│   ├── config/            # Env → typed AppConfig
│   ├── routes/
│   │   └── index.ts       # Composes all `/api/v1/*` routers
│   ├── middleware/        # auth, rate-limit, errors, security (helmet, cors), request id
│   ├── docs/              # OpenAPI builder + Swagger UI setup
│   ├── lib/               # prisma, jwt, logger, push queue, shared helpers
│   ├── modules/           # Feature modules (routes + controller + service + schemas)
│   │   ├── auth/
│   │   ├── health/
│   │   ├── users/
│   │   ├── chats/
│   │   ├── messages/
│   │   ├── groups/
│   │   ├── friends/
│   │   ├── polls/
│   │   ├── files/         # Authenticated file download
│   │   ├── uploads/       # Multipart upload + virus/size checks
│   │   ├── devices/       # Push device registration (Web Push / FCM)
│   │   ├── e2ee/          # Identity, devices, backup, DM E2EE flags
│   │   ├── e2ee/recovery/ # Email step-up for backup restore
│   │   ├── calls/         # Call history REST
│   │   └── moderation/    # Blocks, reports
│   └── sockets/
│       ├── index.ts       # io instance, CORS, optional Redis adapter
│       ├── handlers.ts    # message:send, receipts, typing, presence, call:* …
│       ├── schemas.ts     # Zod for socket payloads
│       └── *.ts           # Presence, call state, integration tests
└── package.json
```

## Quick start

1. **PostgreSQL** - create a database and set `DATABASE_URL` in `.env` (copy from `.env.example`).

2. **Install & migrate**

   ```bash
   npm install
   npm run db:generate
   npm run db:migrate:dev   # or db:migrate for deploy
   ```

3. **Run**

   ```bash
   npm run dev              # tsx watch src/server.ts
   ```

   Default listen: `HOST` + `PORT` from env (often `http://0.0.0.0:4000`).

4. **API base path** - all REST routes are under **`/api/v1`**.

## REST API surface (summary)

Routers are mounted in `src/routes/index.ts`. Typical patterns:

| Prefix | Purpose |
|--------|---------|
| `GET /api/v1/health` | Liveness |
| `GET /api/v1/openapi.json` | Machine-readable OpenAPI |
| `GET /api/v1/config/public` | Public config (e.g. VAPID key for Web Push) |
| `/api/v1/auth/*` | Register, login, refresh, logout, me, forgot/reset password |
| `/api/v1/users/*` | Search users, profiles |
| `/api/v1/chats/*` | List/create chats, messages, mute, E2EE mode, polls under chat |
| `/api/v1/messages/*` | Edit, delete, reactions |
| `/api/v1/groups/*` | Group CRUD, members, roles |
| `/api/v1/friends/*` | Friend requests, accept/reject, list |
| `/api/v1/polls/*` | Poll fetch & vote |
| `/api/v1/files/*` | Authorized download of stored uploads |
| `/api/v1/uploads/*` | Upload pipeline |
| `/api/v1/devices/*` | Register Web Push / FCM tokens |
| `/api/v1/e2ee/*` | Identity keys, device keys, encrypted backup, recovery flows |
| `/api/v1/calls/history` | Recent call logs for current user |
| `/api/v1/moderation/*` | Block/unblock, reports |

**Authoritative detail:** open Swagger at **`/api/docs`** (when enabled) or read `src/docs/openapi.ts` / generated `openapi.json`.

## Socket.IO (realtime)

- **URL:** same origin as the API host (browser often uses `globalThis.location.origin`); path **`/socket.io`**.
- **Auth:** `Authorization: Bearer <accessToken>` or `handshake.auth.token`.
- **Server events** (examples): `session:ready`, `message:new`, `message:updated`, `message:deleted`, `reaction:*`, `receipt:*`, `typing:update`, `presence:changed`, **`call:incoming`**, **`call:ringing`**, **`call:answered`**, **`call:rejected`**, **`call:ended`**, **`call:ice`**, **`groupCall:started`**, **`groupCall:participantUpdate`**, **`groupCall:ended`**, **`groupCall:signal`**.
- **Client events** (examples): `message:send`, `receipt:delivered`, `receipt:read`, `typing:start` / `typing:stop`, `presence:update`, **`call:offer`**, **`call:answer`**, **`call:reject`**, **`call:end`**, **`call:ice`**, **`groupCall:start`**, **`groupCall:join`**, **`groupCall:leave`**, **`groupCall:signal`** (many use ack callbacks `{ ok, data } | { ok: false, code, message }`).

Implementation: `src/sockets/handlers.ts` + `src/sockets/schemas.ts`. Optional **Redis** enables horizontal scaling of Socket.IO via `@socket.io/redis-adapter`.

## Core functionality

- **Accounts:** email/password, JWT access + refresh sessions, optional password reset email (SMTP).
- **Chats:** direct and group threads, members, roles (Owner/Admin/Mod/Member), public/private visibility, last message, unread counts, per-member **favorite** / **close DM** / pin / mute.
- **Messages:** ciphertext for E2EE, attachments metadata, replies, edits, soft delete, reactions, `@mention` metadata.
- **E2EE:** `DM_V1` (mandatory direct chats) and `GROUP_V1` (sender-key group envelopes); server stores public keys / wrapped backups only.
- **Groups:** create, patch, add/remove members, role changes, public join, system activity messages.
- **Friends:** request / accept / reject / remove (API ready; frontend UI pending).
- **Polls:** create in chat, vote, tallies.
- **Uploads:** size/type limits, disk storage under `UPLOAD_DIR`.
- **Push:** device tokens; Web Push (VAPID) and/or FCM; mention-aware routing (`notification-router.ts`).
- **Calls:** 1:1 and group signaling (SDP/ICE not logged); **`CallLog`** + group call system messages for history.
- **Search & previews:** in-chat message search (ILIKE); SSRF-safe link preview fetch + cache.

## Environment variables

See **`.env.example`** for the full list. Important entries:

| Variable | Role |
|----------|------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing secrets (min length enforced in config) |
| `PORT`, `HOST` | HTTP + Socket.IO bind |
| `CORS_ORIGIN` | Allowed browser origin(s) |
| `FRONTEND_URL` | Password-reset links |
| `REFRESH_COOKIE_NAME` | httpOnly refresh cookie |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | File storage |
| `REDIS_URL` | Optional Socket.IO adapter + presence |
| `VAPID_*` / FCM vars | Optional push |
| `ENABLE_SWAGGER` | Expose `/api/docs` in production if set |

## NPM scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode (`tsx watch src/server.ts`) |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/server.js` |
| `npm run db:generate` | Prisma client |
| `npm run db:migrate:dev` | Dev migrations |
| `npm run db:migrate` | Deploy migrations |
| `npm test` | Vitest |
| `npm run cleanup-uploads` | Orphan file maintenance script |
| `npm run db:seed-test` | Dev-only dummy users & groups (see `scripts/seed-dummy-test-data.mjs`) |
| `npm run db:remove-seed` | Remove seed data (`CONFIRM=YES` required) |
| `npm run db:clear-chats` | Wipe chat/message data (destructive) |

### Chat member preferences (REST)

Per-user sidebar state on `ChatMember`:

| Endpoint | Body | Notes |
|----------|------|--------|
| `PATCH /api/v1/chats/:chatId/favorite` | `{ favorited: boolean }` | DMs and groups |
| `PATCH /api/v1/chats/:chatId/close` | `{ closed: boolean }` | DMs only; cleared when a new message arrives |
| `PATCH /api/v1/chats/:chatId/pin` | `{ pinned: boolean }` | Pin in list |
| `PATCH /api/v1/chats/:chatId/mute` | `{ mutedUntil: string \| null }` | Mute notifications |

Leave a group: `DELETE /api/v1/groups/:groupId/members/:userId` (self-leave allowed).

See [../docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) for seed script env vars (`SEED_JOIN_EMAIL`, `SEED_TEST_PASSWORD`).

## Testing

- **Unit / integration:** Vitest (`src/**/*.test.ts`, `*.integration.test.ts`).
- Exercise auth, sockets, uploads via focused npm scripts in `package.json` where defined.

## Security notes

- Secrets never belong in git; use `.env` locally and a secrets manager in production.
- Rate limits on login, forgot-password, refresh (configurable).
- Helmet + CORS + structured logging (request IDs); sensitive fields redacted in logs where implemented.
- Refresh tokens are hashed at rest; access tokens are short-lived.

## Related

- **Frontend:** `../frontend` — Vite SPA consuming `/api/v1` and Socket.IO (see `frontend/README.md`).
- **Integration:** `../docs/INTEGRATION.md` — auth, proxy, socket contract.
- **Feature status:** `../docs/CODEBASE_FEATURE_ANALYSIS.md` — implemented vs pending, roadmap, UI suggestions.
- **E2EE boundaries:** `src/docs/e2ee-boundary.md`
- **TURN (calls):** `../docs/coturn.md`
