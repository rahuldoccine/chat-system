# Chat System — Frontend

Vite + **React 19** SPA for real-time messaging, group channels, WebRTC calls, and installable PWA support.

## Stack

| Layer | Technology |
|--------|------------|
| Build | Vite 8, TypeScript |
| UI | React 19, CSS Modules, Framer Motion, Lucide |
| Theming | Light / dark / system via `ThemeContext` + CSS variables (`data-theme` on `<html>`) |
| State | TanStack React Query + React Context (Auth, Socket, Chat, Theme, Calls) |
| HTTP | Axios (`src/api/axios.ts`) — refresh cookie + 401 retry |
| Routing | React Router 7 |
| Realtime | Socket.IO client (`src/services/socket.ts`, `socketAck.ts`) |
| Forms | React Hook Form + Zod |
| Modals | Native `<dialog>` (`ModalDialog`) + Radix Dialog (incoming call, some confirm flows) |
| PWA | `vite-plugin-pwa`, custom `src/sw.ts` |
| Toasts | Sonner (single global instance in `main.tsx`) |

**Not used:** Redux, Tailwind, lodash-es.

**Shared utilities:** `frontend/shared/http-url.ts` (link preview URL parsing) — mirrored in `backend/shared/` for the API.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

→ **http://localhost:5173** (backend on port **4000** required).

See [../docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) for proxy vs direct API URL and LAN testing.

### Environment (`frontend/.env.example`)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | REST base (default `http://localhost:4000/api/v1`) |
| `VITE_SOCKET_URL` | Socket.IO origin (default `http://localhost:4000`) |
| `VITE_FILES_API_PATH` | Path prefix for protected uploads |
| `VITE_GIPHY_API_KEY` | GIF picker (optional) |
| `VITE_STUN_URL` / `VITE_TURN_*` | WebRTC ICE for calls |
| `VITE_MAX_ATTACHMENTS` / `VITE_MAX_UPLOAD_MB` | Composer limits |

Theme preference is stored in `localStorage` (`chat-theme`) — not an env variable.

## Project structure

```
frontend/src/
├── api/                    # Axios + auth session / refresh
├── components/             # ModalDialog, AppSyncEffects, brand
├── config/                 # env.ts, queryClient
├── context/                # Auth, Socket, Chat, Theme
├── features/
│   ├── auth/               # Login, register, password reset
│   ├── calls/              # 1:1 + group WebRTC, call-layout tokens
│   ├── chat/               # Messages, composer, groups, threads, search
│   ├── pwa/                # Install prompt
│   ├── settings/           # Profile, privacy, push, appearance
│   └── sync/               # Offline outbox (partial)
├── layouts/                # MainLayout (sidebar), GroupActionsModal
├── pages/                  # Home, Settings, auth, NotFound
├── services/               # socket.ts, socketAck.ts, push
├── utils/                  # debounce, asyncHandler, motion
├── index.css               # Global theme tokens (:root + [data-theme='dark'])
├── themeBootstrap.ts       # Apply stored theme before first paint
└── sw.ts                   # Service worker
```

## Routes

| Path | Page |
|------|------|
| `/` | Home — chat shell (`MainLayout` + `HomePage` / `ActiveChatView`) |
| `/settings` | Account, appearance (theme), privacy, push |
| `/login`, `/register`, `/forgot-password` | Auth |
| `*` | `NotFoundPage` |

## Appearance (light / dark theme)

- **Settings → Appearance** or system preference when set to “System”.
- Semantic colors live in [`src/index.css`](src/index.css): `--foreground`, `--surface-elevated`, `--muted-foreground`, sidebar tokens, call overlay tokens (`--call-modal-fg` in `features/calls/styles/call-layout.css`).
- **Sidebar** stays Discord-style dark in both themes (by design).
- **Main chat area** and **dashboard** follow the active theme.
- **Modals** (group actions, create group, call incoming/outgoing) use theme variables so text contrast is correct in light mode.
- **Empty states** inherit color from their parent container (`EmptyState` uses `color: inherit` on titles).

## Sidebar (`MainLayout`)

Order: **Favorites** → **Channels** → **Direct Messages**.

| Section | Actions |
|---------|---------|
| **Favorites** | Starred channels and DMs |
| **Channels** | **+** create/join public · **⋯** channel menu |
| **Direct Messages** | **+** new DM · **⋯** DM settings |

Per-row **⋯** menu: favorite, close DM (DMs), leave group (channels).

**Jump to…** — search bar or `Cmd/Ctrl+K` → `JumpToSearch`.

## Implemented UI

### Messaging
- Direct + group chats, optimistic send, cursor pagination
- Text, images, files, voice notes, GIFs, polls
- Reply, edit, delete, forward, reactions, pins, threads
- In-chat search, link previews, `@mentions`, `@all` (group admins)

### Groups
- Create group (avatar, visibility, members)
- Join public channels/groups modal
- Group info panel, roles, public join

### Calls
- 1:1 and group audio/video (WebRTC + socket signaling)
- Incoming/outgoing modals with theme-aware text on mobile full-screen overlay
- Call history panels, responsive `CallOverlay`

### PWA & responsive
- Install prompt, update toast, offline shell
- Mobile: full-screen chat, sub-nav panels, touch-friendly composer

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (port 5173) |
| `npm run build` | `tsc -b` + production build |
| `npm run preview` | Preview production build |
| `npm test` | Vitest |
| `npm run lint` | ESLint |

## Related docs

- [../docs/README.md](../docs/README.md) — Project overview & quick start
- [../docs/INTEGRATION.md](../docs/INTEGRATION.md) — Auth, API, sockets
- [../docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) — Setup, seed data, scripts
- [../docs/CODEBASE_FEATURE_ANALYSIS.md](../docs/CODEBASE_FEATURE_ANALYSIS.md) — Feature status
- [../backend/README.md](../backend/README.md) — API reference

## Known gaps

- **Friends UI** — backend ready; no dedicated friends sidebar yet
- **Offline outbox** — partial reconnect flush
- **CI / E2E** — no GitHub Actions / Playwright in repo yet
