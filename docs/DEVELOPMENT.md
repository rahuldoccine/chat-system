# Development guide

Practical setup and day-to-day commands for the **chat-module** monorepo (`frontend/` + `backend/`).

## Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** (local or Docker)
- Optional: **Redis** (`REDIS_URL`) for multi-instance Socket.IO
- Optional: **SMTP** for password reset / E2EE recovery email
- Optional: **VAPID** / **FCM** for Web Push
- Optional: **coturn** for WebRTC on strict NAT — see [coturn.md](./coturn.md)

## First-time setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (min 32 chars each)

npm install
npm run db:generate
npm run db:migrate:dev
npm run dev
```

API listens on `http://127.0.0.1:4000` by default (`HOST` / `PORT` in `.env`).

- REST: `http://localhost:4000/api/v1`
- Swagger (when enabled): `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/v1/openapi.json`

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# Default VITE_API_URL and VITE_SOCKET_URL point at localhost:4000

npm install
npm run dev
```

Open `http://localhost:5173`.

**Proxy (optional):** To use relative `/api/v1` and same-origin sockets, set `VITE_API_URL=/api/v1` and `VITE_SOCKET_URL` empty; Vite proxies `/api` and `/socket.io` to the backend (see `frontend/vite.config.ts`).

## Dev-only test data (backend)

Scripts under `backend/scripts/` — safe to remove later.

| Command | Purpose |
|---------|---------|
| `npm run db:seed-test` | Creates `@seed-test.local` users, public/private groups, sample DMs. Adds `SEED_JOIN_EMAIL` (default `rahul.doccine@gmail.com`) to every seeded group. |
| `npm run db:seed-test -- --users=15 --public=5 --private=5` | Custom counts |
| `npm run db:seed-test -- --dry-run` | Preview only |
| `CONFIRM=YES npm run db:remove-seed` | Deletes seed users, manifest chats, seed-only DMs; cleans orphan DMs for join user |
| `npm run db:clear-chats` | Wipes chat/message data (destructive — see script header) |

Environment:

- `SEED_TEST_PASSWORD` — password for all seed users (default `SeedTest123!`)
- `SEED_JOIN_EMAIL` — account auto-added to every seeded group

Manifest: `backend/scripts/.seed-test-manifest.json` (gitignored).

## Sidebar chat preferences (per user)

Stored on `ChatMember`:

| Field | API | UI |
|-------|-----|-----|
| `favoritedAt` | `PATCH /api/v1/chats/:chatId/favorite` `{ favorited: boolean }` | **Favorites** section (channels + DMs) |
| `closedAt` | `PATCH /api/v1/chats/:chatId/close` `{ closed: boolean }` | **Close DM** (DM list only; reopens on new message) |
| `pinnedAt` | `PATCH /api/v1/chats/:chatId/pin` | Pin / context menu |

**Leave group:** `DELETE /api/v1/groups/:groupId/members/:userId` (self) — sidebar channel menu or Group Info panel.

## Common commands

### Backend (`backend/`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode API + Socket.IO |
| `npm run build` / `npm start` | Production compile + run |
| `npm test` | Vitest unit/integration tests |
| `npm run db:migrate` | Deploy migrations (production) |
| `npm run cleanup-uploads` | Orphan upload maintenance |

### Frontend (`frontend/`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build (includes PWA service worker) |
| `npm run preview` | Preview production build |
| `npm test` | Vitest (e.g. E2EE crypto tests) |

## Project layout (actual)

```
chat-module/
├── backend/
│   ├── src/              # API, sockets, modules
│   ├── prisma/
│   └── shared/           # e.g. http-url helpers
├── frontend/
│   ├── src/              # React app (api, features, pages, …)
│   └── shared/           # mirror of backend shared helpers
└── docs/                 # README.md = overview; INTEGRATION, DEVELOPMENT, …
```

## Routes (frontend)

| Path | Page |
|------|------|
| `/` | Home (chat shell; protected) |
| `/settings` | User settings |
| `/login`, `/register`, `/forgot-password` | Auth |
| `*` | **404** — `NotFoundPage` |

## Related docs

- [INTEGRATION.md](./INTEGRATION.md) — Auth, API, sockets, env alignment
- [CODEBASE_FEATURE_ANALYSIS.md](./CODEBASE_FEATURE_ANALYSIS.md) — Implemented vs pending features
- [../backend/README.md](../backend/README.md) — API modules, sockets, env
- [../frontend/README.md](../frontend/README.md) — UI features, structure
- [../backend/src/docs/e2ee-boundary.md](../backend/src/docs/e2ee-boundary.md) — E2EE server boundaries
