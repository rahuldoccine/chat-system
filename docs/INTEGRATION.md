# Backend ↔ frontend integration

How the **Vite + React 19** SPA (`frontend/`) connects to the **Express + Socket.IO** API (`backend/`).

## 1. Runtime topology

| Piece | Default local URL | Notes |
|--------|-------------------|--------|
| Backend HTTP + Socket.IO | `http://127.0.0.1:4000` | REST under **`/api/v1`**, Socket.IO path **`/socket.io`**. |
| Frontend (Vite dev) | `http://localhost:5173` | SPA origin. |
| API base | **`/api/v1`** | Mounted in `backend/src/app.ts`. |

**Development options:**

1. **Direct** (default in `.env.example`): `VITE_API_URL=http://localhost:4000/api/v1`, `VITE_SOCKET_URL=http://localhost:4000`. Set backend `CORS_ORIGIN` to include `http://localhost:5173`.
2. **Vite proxy**: `VITE_API_URL=/api/v1`, leave socket URL unset so the client uses `globalThis.location.origin`. Vite proxies `/api` and `/socket.io` to `VITE_PROXY_TARGET` (see `frontend/vite.config.ts`).

## 2. Environment variables

### Frontend (`frontend/.env`)

| Variable | Role |
|----------|------|
| `VITE_API_URL` | Axios base URL (default `http://localhost:4000/api/v1`) |
| `VITE_SOCKET_URL` | Socket.IO origin (defaults to `globalThis.location.origin` if empty) |
| `VITE_FILES_API_PATH` | File download prefix (default `/api/v1/files`) |
| `VITE_GIPHY_API_KEY` | GIF picker |
| `VITE_STUN_URL` / `VITE_TURN_*` | WebRTC ICE |

Accessor: `frontend/src/config/env.ts`.

### Backend (`backend/.env`)

| Variable | Role |
|----------|------|
| `DATABASE_URL` | PostgreSQL |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing |
| `PORT`, `HOST` | Listen address |
| `CORS_ORIGIN` | Allowed SPA origin(s) |
| `REFRESH_COOKIE_NAME` | httpOnly refresh cookie |
| `FRONTEND_URL` | Password-reset email links |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Local uploads |
| `REDIS_URL` | Optional Socket.IO adapter |
| `VAPID_*` | Web Push |

See `backend/.env.example` for the full list.

## 3. Authentication

**Model:** short-lived **access JWT** (in memory via `authSession`) + **refresh token** in an **httpOnly cookie**.

**REST (`frontend/src/api/axios.ts`):**

- `withCredentials: true` on Axios
- Request interceptor adds `Authorization: Bearer <accessToken>`
- On **401**, POST `/auth/refresh` (unless URL is login/register/refresh), retry once
- `AuthContext` restores session on load via refresh + `GET /users/me`

**Socket.IO (`frontend/src/context/SocketContext.tsx`):**

- Connects with `auth: { token: accessToken }` when authenticated
- Backend validates JWT on handshake

## 4. REST from the frontend

**Primary client:** Axios instance in `frontend/src/api/axios.ts`.

**Server state:** TanStack React Query (`frontend/src/features/chat/hooks/useChatData.ts` and feature-specific hooks).

| Area | Typical paths |
|------|----------------|
| Auth | `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all` |
| Users | `/users/me`, `/users/search` |
| Chats | `GET/POST /chats`, `GET /chats/:id`, messages, mute, pin, **favorite**, **close** |
| Messages | `PATCH/DELETE /messages/:id`, reactions |
| Groups | `/groups/*` — CRUD, members, roles, join |
| Uploads | `POST /uploads`, `GET /files/:key` |
| Calls | `/calls/history` |
| Devices | `/devices/web` — Web Push subscription |

**Chat sidebar preferences:**

```http
PATCH /api/v1/chats/:chatId/favorite   { "favorited": true|false }
PATCH /api/v1/chats/:chatId/close      { "closed": true|false }   # DMs only
PATCH /api/v1/chats/:chatId/pin        { "pinned": true|false }
```

Frontend: `frontend/src/features/chat/api/chatsApi.ts` — used from `MainLayout` (`ChatSidebarMenu`).

**Leave group:**

```http
DELETE /api/v1/groups/:groupId/members/:userId
```

Frontend: `leaveGroup()` in `frontend/src/features/chat/api/groupsApi.ts`.

## 5. Socket.IO events

**Client:** `frontend/src/services/socket.ts` (or socket helper used by `SocketContext`).

**Server:** `backend/src/sockets/handlers.ts`.

**Client → server (examples):** `chat:subscribe`, `message:send`, `receipt:delivered`, `receipt:read`, `typing:start`, `typing:stop`, `presence:update`, `call:*`, `groupCall:*`.

**Server → client (examples):** `session:ready`, `message:new`, `message:updated`, `message:deleted`, `receipt:*`, `typing:update`, `presence:changed`, `call:incoming`, `groupCall:started`, …

Realtime cache updates: `ConversationRealtimeSync`, socket handlers in `SocketContext`, React Query invalidation.

## 6. WebRTC (calls)

- Signaling over Socket.IO only (not a media SFU).
- REST call history: `GET /api/v1/calls/history`.
- ICE: STUN from env; optional TURN — [coturn.md](./coturn.md).

## 7. Frontend routes & layout

Router: `frontend/src/App.tsx`.

| Path | Screen |
|------|--------|
| `/` | `HomePage` — `MainLayout` + chat panel (protected) |
| `/settings` | `SettingsPage` |
| `/login`, `/register`, `/forgot-password` | Auth pages |
| `*` | `NotFoundPage` (404) |

**MainLayout sidebar order:** Favorites → Channels → Direct Messages.

- Per-row **⋯** menu: Favorite, Close DM (DMs) or Leave group (channels)
- **Jump to…** (`Cmd/Ctrl+K`): `JumpToSearch` — chats + user search, start DM

## 8. OpenAPI & moderation

- **OpenAPI:** `GET /api/v1/openapi.json`, Swagger at `/api/docs` when `ENABLE_SWAGGER` or dev.
- **Moderation:** `/api/v1/moderation/*` — block/report from settings / chat UI.

## Related

- [DEVELOPMENT.md](./DEVELOPMENT.md) — setup, seed scripts, commands
- [CODEBASE_FEATURE_ANALYSIS.md](./CODEBASE_FEATURE_ANALYSIS.md) — feature checklist
- [../backend/README.md](../backend/README.md) · [../frontend/README.md](../frontend/README.md)
