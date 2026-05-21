# Chat Module - Feature Analysis

**Scope:** `frontend/` + `backend/` · **Stack:** React/Vite, Express, Prisma, PostgreSQL, Socket.IO  
**Last reviewed:** 2026-05-20 (aligned with current repo + recent link-preview / search work)

---

## Summary

| Layer | Status |
|--------|--------|
| Backend API & sockets | Mature — auth, chats, messages, groups, friends, uploads, E2EE APIs, call signaling, push, link preview, in-chat search |
| Frontend chat UI | Strong — messaging, media, pins, receipts, typing, presence, polls, voice notes, calls UI, settings, link previews, in-chat search |
| Main gaps | **friends/groups UI**, global sidebar search, full PWA/CI, threads/@mentions/OAuth |

**Stack (actual):** React Query + Context (not Redux), CSS Modules (not Tailwind), **Giphy** (`frontend/src/config/env.ts` — README still mentions Tenor in places).

**Docs drift:** `readme.md` sprint/feature list is aspirational; treat this file + `docs/INTEGRATION.md` as integration truth for the repo.

---

## Implemented features

### Auth & users
- Register, login, forgot/reset password, protected routes, `/auth/me` session restore
- User search → start DM (`NewDmModal`)
- **Refresh session (Phase 0 — done):** `withCredentials` on Axios (`frontend/src/api/axios.ts`), `POST /auth/refresh` via `authSession.ts`, 401 retry interceptor, init refresh in `AuthContext`
- Settings route `/settings`, profile patch, `logout-all` (`SettingsPage`, `AuthContext`)

### Chats & messaging
- DM create/list, unread badges, paginated history, real-time `message:new`
- Text / image / file messages, reply, edit, delete, forward
- Reactions, pin/unpin, pins panel, date dividers, unread divider, drafts
- Sub-nav: Messages · Files & Media · Pins · Call History
- Socket reconnect hardening (`frontend/src/services/socket.ts`, `SocketContext.tsx`)

### Real-time & receipts
- Socket: subscribe, typing, presence, delivered/read receipts (HTTP + socket)
- `ConversationRealtimeSync` for sidebar previews
- Offline outbox **partial** (`frontend/src/features/sync/outbox.ts`, `sendMessage.ts`)

### Media & composer
- Multi-file upload, grouped attachments, image lightbox, PDF/DOCX/XLS preview
- Giphy GIF picker
- Files & Media panel with load-more
- **Voice notes (Phase 5 — done):** `useVoiceRecorder`, mic in `MessageComposer`, `VoiceAttachment` / audio file UI
- **Polls (Phase 3 — done):** `CreatePollModal`, `POST /chats/:chatId/polls`, `PollMessage`, vote hook

### Calls (Phase 6 — largely done)
- Backend `call:*` signaling + call history API
- Frontend: `CallProvider`, `CallManager`, `IncomingCallModal`, `CallOverlay`, Phone/Video on `HomePage`, `ChatCallHistoryPanel`
- Optional TURN: `docs/coturn.md`, `frontend/src/features/calls/iceConfig.ts`

### Search & link previews (Phase 9 — done)
| Item | Backend | Frontend |
|------|---------|----------|
| In-chat search | `GET /chats/:chatId/messages/search` (`searchMessagesInChat`, ILIKE; E2EE → `searchUnavailable`) | `ChatSearchDialog`, `useChatMessageSearch`, Cmd/Ctrl+K in `HomePage`, scroll-to-message |
| Link preview OG | `GET /chats/link-preview`, SSRF-safe fetch, cache, async enrichment on send | `LinkPreviewBlock`, `useLinkPreview`, composer + `MessageStream`, display modes inline/preview/url |
| Tests | `chats.search.test.ts`, `link-preview.test.ts` | — |

### Settings, moderation, push (partial)
- Profile, avatar upload, user settings (`useUserSettings`)
- Mute chat, block/report (`ChatDetailsPanel`, `DmHeaderMenu`, `ReportUserModal`)
- Web Push: `public/sw.js`, `frontend/src/services/push.ts`, `PushSubscriptionSync` in `main.tsx` (needs VAPID + user opt-in in Settings)

### E2EE (mandatory DM — done)
- **Policy:** all `DIRECT` chats use `DM_V1`; downgrade to `NONE` rejected
- **Client:** `frontend/src/features/e2ee/` — Web Crypto P-256 ECDH + AES-GCM, auto keygen on login/register, encrypt on send, decrypt on read, encrypted voice/file uploads
- **No UI toggle** — read-only “end-to-end encrypted” in DM header; recovery in Settings → Privacy
- Legacy messages without `contentMeta.e2eeVersion` still render as historical plaintext

### Backend-only (API exists, no or minimal UI)
- **Friends** — no frontend calls to `/friends/*` found
- **Groups** — list shows existing GROUP chats; **no create group / member / role UI** (Channels **+** is decorative)

### Tests & CI
- Backend: auth, sockets, uploads, E2EE rules + policy, search, link-preview (~18+ test files)
- Frontend: `features/e2ee/crypto.test.ts` (vitest)
- **CI:** no `.github/workflows` at repo root (Phase 10 pending)

---

## Missing or incomplete (integration pending)

| Area | Gap | Phase |
|------|-----|-------|
| **E2EE** | No `frontend/src/features/e2ee/`; encrypt/decrypt not wired in send/render | 7 |
| **Friends** | No friends list, requests, accept/reject UI | 2.1 |
| **Groups** | No create wizard, member list, promote/demote; sidebar **+** on Channels unwired | 2.2–2.4 |
| **Global search** | Sidebar “Jump to…” input is placeholder only (in-chat search works per open chat) | 9+ |
| **PWA** | SW exists for push; no `manifest.webmanifest` / `vite-plugin-pwa` install UX | 10.1 |
| **CI / E2E** | No GitHub Actions, no Playwright | 10.2–10.3 |
| **Outbox** | IndexedDB outbox exists; full reconnect flush + `sync:hello` / tab coordinator incomplete | 8 |
| **Other** | Threads, @mentions, OAuth, group invites, Meilisearch (optional upgrade from ILIKE search) | — |

---

## Phase status (integration checklist)

| Phase | Goal | Status |
|-------|------|--------|
| **0** Session refresh | Silent renew, 401 retry, logout-all | **Done** — `axios.ts`, `authSession.ts`, `AuthContext` |
| **1** Settings & profile | `/settings`, mute, block/report | **Done** — `SettingsPage`, chat details, moderation modals |
| **2** Friends & groups | Friends panel, group CRUD UI | **Pending** — backend ready, frontend not wired |
| **3** Polls | Composer poll → render → vote | **Done** |
| **4** Web Push | SW + `POST /devices/web` | **Partial** — code present; needs env + Settings UX polish |
| **5** Voice notes | Record → upload → play | **Done** |
| **6** WebRTC calls | Signaling + header buttons + in-call UI | **Done** (TURN optional for NAT) |
| **7** Client E2EE | Keys, encrypt send, decrypt render | **Not started** (largest privacy gap) |
| **8** Offline outbox | Queue, socket ack, multi-tab | **Partial** — outbox + send helper; not full Phase 8 spec |
| **9** Search & link previews | Search route + preview card | **Done** |
| **10** PWA, CI, scale | Manifest, Actions, Redis adapter docs | **Pending** |

---

## Quick reference — key paths

| Area | Path |
|------|------|
| API routes | `backend/src/routes/index.ts` |
| Socket handlers | `backend/src/sockets/handlers.ts` |
| Link preview (BE) | `backend/src/lib/link-preview.ts` |
| In-chat search (BE) | `backend/src/modules/chats/chats.service.ts` → `searchMessagesInChat` |
| Message UI | `frontend/src/features/chat/components/MessageStream.tsx` |
| Composer + previews | `frontend/src/features/chat/components/MessageComposer.tsx`, `LinkPreviewBlock.tsx` |
| In-chat search (FE) | `frontend/src/features/chat/components/ChatSearchDialog.tsx` |
| Auth / refresh | `frontend/src/context/AuthContext.tsx`, `frontend/src/api/axios.ts` |
| Calls | `frontend/src/features/calls/CallProvider.tsx` |
| Push | `frontend/src/services/push.ts`, `frontend/public/sw.js` |
| E2EE rules (BE) | `backend/src/docs/e2ee-boundary.md` |
| Integration guide | `docs/INTEGRATION.md` |

---

## Recommended next integration order

1. **Phase 2** — Friends + group create/manage (APIs already exist; highest UX gap vs backend).
2. **Phase 7** — Client E2EE for DMs (matches product promise in `readme.md`).
3. **Phase 8** — Finish outbox flush + reconnect sync (reliability).
4. **Phase 10** — PWA manifest + CI pipeline.
5. **Polish** — Wire sidebar “Jump to…” (global chat/user search), `readme.md` stack alignment (React Query, Giphy, CSS Modules).

---

## readme.md alignment notes

| readme.md claims | Repo reality |
|------------------|--------------|
| Redux Toolkit | React Query + Context |
| Tailwind CSS | CSS Modules |
| Tenor GIFs | Giphy (`env.ts`) |
| Message search | In-chat search **implemented**; global jump **not** |
| Link previews | **Implemented** (composer + messages) |
| Voice / calls / polls | **Implemented** in UI |
| E2EE private chats | **Server-ready; client not integrated** |

Update `readme.md` when marketing/docs should match the codebase, or add a short “Implementation status” link to this file.
