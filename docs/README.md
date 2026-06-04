# Chat Module — Secure E2EE Real-Time Messaging

A **full-stack chat application** (React + Express + PostgreSQL + Socket.IO) with **mandatory E2EE for direct messages**, **group sender-key encryption**, **WebRTC calls**, **PWA**, and a **Slack-style sidebar** (Favorites, Channels, Direct Messages).

| Resource | Description |
|----------|-------------|
| [CODEBASE_FEATURE_ANALYSIS.md](./CODEBASE_FEATURE_ANALYSIS.md) | What is implemented vs planned |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Setup, env, scripts, seed data |
| [INTEGRATION.md](./INTEGRATION.md) | Auth, Axios, React Query, Socket.IO |
| [../frontend/README.md](../frontend/README.md) | UI, themes, PWA, frontend structure |
| [../backend/README.md](../backend/README.md) | API, sockets, Prisma, npm scripts |
| [coturn.md](./coturn.md) | TURN server for WebRTC |

---

## Quick start

**Requirements:** Node.js **≥ 20**, PostgreSQL, npm.

```bash
# Terminal 1 — backend
cd backend && cp .env.example .env
# Set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
npm install && npm run db:generate && npm run db:migrate:dev && npm run dev

# Terminal 2 — frontend
cd frontend && cp .env.example .env
npm install && npm run dev
```

| Service | URL |
|---------|-----|
| Web app | http://localhost:5173 |
| REST API | http://localhost:4000/api/v1 |
| Swagger UI | http://localhost:4000/api/docs (when enabled) |

**Optional dev seed** (dummy users + groups):

```bash
cd backend && npm run db:seed-test
# Remove later: CONFIRM=YES npm run db:remove-seed
```

**Build & test:**

```bash
cd backend && npm run build && npm test
cd frontend && npm run build && npm test
```

---

## Repository layout

```
chat-module/
├── backend/           # Express + Prisma + Socket.IO
│   └── shared/        # Backend utilities (e.g. http-url)
├── frontend/          # Vite + React 19 SPA
│   └── shared/        # Frontend copy of the same helpers
└── docs/              # This folder — guides and reference
```

### Frontend (`frontend/`)

- **Stack:** React 19, TanStack Query, Socket.IO client, CSS Modules, Framer Motion, PWA
- **Themes:** Light / dark / system (`ThemeContext`, tokens in `src/index.css`)
- **Sidebar:** Discord-style dark rail in both themes; main chat area follows active theme
- **Entry:** `src/main.tsx` → `App.tsx` → `HomePage` / `SettingsPage` / auth routes

### Backend (`backend/`)

- **Stack:** Express 4, Prisma 6, Socket.IO 4, Zod, optional Redis adapter
- **API prefix:** `/api/v1`
- **Sockets:** `src/sockets/handlers.ts` + `handlers-shared.ts` (acks, reconnect delivery flush)
- **IDs:** `crypto.randomUUID()` (no separate `uuid` package)

See package READMEs for full folder trees and scripts.

---

## Highlights (current build)

### Chat & UI
- **Sidebar:** Favorites → Channels → Direct Messages; per-chat **⋯** menu
- **DM:** Favorite, close DM (reopens on new message)
- **Channels:** Favorite, leave group, join public groups
- **Jump to…** (`Cmd/Ctrl+K`) — search chats and users
- **Appearance:** Light, dark, or system theme (Settings → Appearance)
- **Responsive** chat, calls, settings, composer (mobile + tablet + desktop)
- **404** for unknown routes

### Messaging & groups
- Real-time messages with optimistic send, pagination, threads
- Text, images, files, voice notes, GIFs, polls, reactions, pins, forwards
- In-chat search, link previews, `@mentions`, `@all` (group admins)
- Group create (avatar, visibility, members), roles, public join

### Security & calls
- **E2EE:** `DM_V1` (all DMs), `GROUP_V1` (new groups) — server stores ciphertext + keys only
- **Calls:** 1:1 and group audio/video (WebRTC + socket signaling)
- Block / report APIs; authorized file downloads

### Platform
- **PWA:** Install prompt, service worker, update toast
- **Push:** Web Push (VAPID) and/or FCM (optional)
- **Email:** Password reset + E2EE recovery (SMTP optional in dev)

---

## Pre-requirements

| Item | Required? | Notes |
|------|-----------|--------|
| Node.js ≥ 20 | Yes | Backend `engines` field |
| PostgreSQL | Yes | `DATABASE_URL` in `backend/.env` |
| JWT secrets | Yes | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` |
| SMTP | Optional | Forgot-password / recovery emails log a warning if unset |
| Firebase / VAPID | Optional | Push notifications |
| TURN server | Optional | Recommended for calls behind strict NAT ([coturn](./coturn.md)) |
| `uploads/` directory | Yes (auto-created) | `UPLOAD_DIR` on backend |

Copy `backend/.env.example` and `frontend/.env.example` before running.

---

## Tech stack

### Frontend
- React 19 + Vite 8 + TypeScript
- TanStack React Query + React Context (auth, socket, chat, theme, calls)
- React Router 7, Axios, React Hook Form + Zod
- Socket.IO client; shared socket ack helpers (`socketAck.ts`)
- CSS Modules + semantic design tokens (`index.css`, `[data-theme='dark']`)
- Framer Motion, Lucide, Sonner toasts
- vite-plugin-pwa, emoji-picker-react, docx-preview, xlsx
- Radix Dialog (selected modals); native `<dialog>` elsewhere

### Backend
- Node.js + Express + Socket.IO (+ optional Redis adapter)
- PostgreSQL + Prisma ORM
- JWT access/refresh, bcrypt, Zod validation
- Multer uploads, authorized `/files/*` routes
- Nodemailer (SMTP), web-push / firebase-admin (optional push)
- Helmet, CORS, express-rate-limit, Pino logging
- OpenAPI + Swagger UI

---

## Features

### Chat & messaging
- Real-time messaging, typing indicators, delivery/read receipts, unread counts
- Edit, delete, reply, forward, reactions, pins, threads
- Message search (in-chat), link previews
- Voice notes (E2EE in DMs), GIFs (Giphy), file attachments

### Calls
- 1:1 and group audio/video (WebRTC)
- Call history panels; incoming/outgoing modals with theme-aware text

### Social & groups
- Group chats with Owner/Admin/Mod/Member roles
- Public channel join; group info panel
- **Friends API** ready — **friends UI** in sidebar when enabled
- Polls, mentions, moderation (block/report)

### Account & settings
- Profile, avatar, privacy toggles, sessions (logout all devices)
- E2EE key backup / recovery (Settings → Privacy)
- Forgot / reset password

### PWA & reliability
- Installable PWA, offline shell
- Partial offline outbox on reconnect (full queue planned)

---

## Privacy & encryption

**In this repo:** Direct chats use mandatory client-side E2EE (`DM_V1`). Keys are created on register/login (`frontend/src/features/e2ee/`). New DM content is encrypted before upload; the server stores ciphertext and public key material only.

**Group chats:** New groups can use `GROUP_V1` sender-key encryption for message bodies and attachments.

**Not E2EE:** WebRTC call media (signaling only on server). Legacy plaintext messages may still display until rotated.

Server boundary details: [../backend/src/docs/e2ee-boundary.md](../backend/src/docs/e2ee-boundary.md).

---

## Roadmap (planned)

| Item | Status |
|------|--------|
| Friends UI (sidebar) | API + UI in app |
| Group invite links | Public join done; shareable invite URLs planned |
| OAuth (Google/GitHub) | Planned |
| SFU for large group video | Planned |
| Screen sharing | Planned |
| CI / E2E (Playwright) | Planned |
| Full offline outbox | Partial |

---

## Who can use this project

- **Teams & startups** — Private team chat with E2EE DMs  
- **Developers** — Reference for real-time + E2EE + WebRTC patterns  
- **Learners** — Full-stack TypeScript example  
- **Personal use** — Self-hosted chat (configure your own infra)

---

## Reference: original build plan

The sections below were the initial implementation roadmap. **Most sprints are complete** in this repository; use [CODEBASE_FEATURE_ANALYSIS.md](./CODEBASE_FEATURE_ANALYSIS.md) for an accurate gap list.

<details>
<summary>Sprint-wise build plan (historical)</summary>

1. **Foundation** — frontend/backend apps, Prisma, uploads dir  
2. **Auth** — register, login, refresh, logout, password reset  
3. **Core chat APIs** — chats, messages, list UI  
4. **Realtime** — Socket.IO, receipts, typing, presence  
5. **Friends & groups** — roles, members  
6. **Uploads** — multer, secure file access  
7. **Notifications** — push tokens, reconnect flush  
8. **E2EE** — DM_V1, backup/recovery  
9. **Calls & polish** — WebRTC, rate limits, responsive UI  

</details>

<details>
<summary>API endpoint checklist (summary)</summary>

REST lives under `/api/v1`. See [../backend/README.md](../backend/README.md) and Swagger for the full surface.

**Auth:** register, login, refresh, logout, forgot/reset password  
**Users:** me, search, profiles  
**Chats:** list, create, messages, favorite, close, pin, mute, E2EE mode  
**Messages:** edit, delete, reactions  
**Groups:** create, members, roles  
**Friends:** request, accept, remove  
**Uploads / files:** multipart upload, authorized download  
**E2EE:** keys, backup, recovery  
**Calls:** history  
**Moderation:** block, report  

**Socket (examples):** `message:send`, `receipt:*`, `typing:update`, `presence:changed`, `call:*`, `groupCall:*`

</details>

<details>
<summary>Database models (Prisma)</summary>

Core models include `User`, `Session`, `Chat`, `ChatMember`, `Message`, `Receipt`, `Reaction`, `Friend`, `Block`, `Report`, `Poll`, `CallLog`, `DeviceToken`, and E2EE-related tables. See `backend/prisma/schema.prisma`.

</details>

---

## Advanced UI/UX notes

- **Layout:** Sidebar list → conversation → optional details panel; mobile uses stacked navigation  
- **Design tokens:** CSS variables for light/dark; sidebar tokens stay dark for contrast  
- **Accessibility:** Keyboard shortcuts (e.g. jump search), focusable controls, reduced-motion friendly animations where possible  
- **States:** Empty, loading skeletons, offline/reconnect banners, toast errors with retry  

---

*Built as a learning and production-oriented chat module. For deployment, configure secrets, SMTP, push, TURN, and CORS for your domain — see [DEVELOPMENT.md](./DEVELOPMENT.md).*
