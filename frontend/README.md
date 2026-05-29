# Chat System — Frontend

Vite + **React 19** SPA for real-time messaging, group channels, WebRTC calls, and client-side E2EE.

## Stack

| Layer | Technology |
|--------|------------|
| Build | Vite 8, TypeScript |
| UI | React 19, CSS Modules, Framer Motion, Lucide |
| State | **TanStack React Query** + React Context (Auth, Socket, Chat, Calls) |
| HTTP | **Axios** (`src/api/axios.ts`) — refresh cookie + 401 retry |
| Routing | React Router 7 |
| Realtime | Socket.IO client |
| Forms | React Hook Form + Zod |
| PWA | `vite-plugin-pwa`, custom `src/sw.ts` |
| Toasts | Sonner |

**Not used:** Redux, Tailwind.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

→ `http://localhost:5173` (backend on port **4000** required).

See [../docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) for proxy vs direct API URL setup.

### Environment (`frontend/.env.example`)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | REST base (default `http://localhost:4000/api/v1`) |
| `VITE_SOCKET_URL` | Socket.IO origin (default `http://localhost:4000`) |
| `VITE_GIPHY_API_KEY` | GIF picker |
| `VITE_STUN_URL` / `VITE_TURN_*` | WebRTC ICE |

## Project structure

```
frontend/src/
├── api/                 # Axios + auth session / refresh
├── config/              # env.ts, queryClient
├── context/             # Auth, Socket, Chat
├── features/
│   ├── auth/            # Login, register, password reset
│   ├── calls/           # 1:1 + group WebRTC
│   ├── chat/            # Messages, composer, groups, threads, JumpToSearch
│   ├── e2ee/            # DM_V1 + GROUP_V1
│   ├── pwa/             # Install prompt
│   ├── settings/        # Profile, privacy, push
│   └── sync/            # Offline outbox (partial)
├── layouts/             # MainLayout (sidebar), AuthLayout
├── pages/               # Home, Settings, auth, NotFound (404)
├── services/            # socket, push
└── sw.ts                # Service worker
```

## Routes

| Path | Page |
|------|------|
| `/` | Home — chat shell (`MainLayout` + `HomePage`) |
| `/settings` | Profile, privacy, E2EE recovery, push |
| `/login`, `/register`, `/forgot-password` | Auth |
| `*` | **404** — `NotFoundPage` |

## Sidebar (`MainLayout`)

Order: **Favorites** → **Channels** → **Direct Messages**.

| Section | Actions |
|---------|---------|
| **Favorites** | Starred channels and DMs (empty hint when none) |
| **Channels** | **+** create/join public · **⋯** settings for active channel |
| **Direct Messages** | **+** new DM · **⋯** DM settings for active chat |

Per-row **⋯** menu (`ChatSidebarMenu`):

- **DMs:** Favorite · Close DM
- **Channels:** Favorite · Leave group (confirm modal)

**Jump to…** — search bar / `Cmd+Ctrl+K` → `JumpToSearch` (chats + users).

## Implemented UI

### Messaging
- Direct + group chats, optimistic send, pagination
- Text, images, files, voice notes, GIFs, polls
- Reply, edit, delete, forward, reactions, pins, threads
- In-chat search, link previews, `@mentions`, `@all` (admins)

### Groups
- Create group (avatar, visibility, members)
- Join public channels, group info / roles panel
- Leave from sidebar menu or group settings

### Calls
- 1:1 and group audio/video, history panels, responsive overlays

### E2EE
- Mandatory DM encryption; GROUP_V1 on new groups
- Key backup / recovery in Settings → Privacy

### PWA & responsive
- Install prompt, update toast, offline shell
- Mobile: full-screen thread, sub-nav panels, call UI, touch-friendly composer

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm test` | Vitest |
| `npm run lint` | ESLint |

## Related docs

- [../docs/INTEGRATION.md](../docs/INTEGRATION.md) — Auth, API, sockets
- [../docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) — Monorepo setup & seed data
- [../docs/CODEBASE_FEATURE_ANALYSIS.md](../docs/CODEBASE_FEATURE_ANALYSIS.md) — Feature status

## Known gaps

- **Friends UI** — backend ready, no sidebar friends panel
- **Offline outbox** — partial reconnect flush
- **CI / E2E** — no GitHub Actions / Playwright yet
