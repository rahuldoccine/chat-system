# Chat Module — Feature Analysis

**Scope:** `frontend/` + `backend/` · **Stack:** React/Vite, Express, Prisma, PostgreSQL, Socket.IO  
**Last reviewed:** 2026-05-29 (sidebar favorites, group/DM settings, 404, responsive pass)

---

## Summary

| Layer | Status |
|--------|--------|
| Backend API & sockets | Mature — auth, chats, messages, groups, friends, uploads, DM + group E2EE, call signaling, group calls, push, link preview, in-chat search, mentions |
| Frontend chat UI | Strong — messaging, media, pins, receipts, typing, presence, polls, voice notes, 1:1 + group calls, settings, link previews, in-chat search, groups, mentions, threads, PWA |
| Main gaps | **Friends UI**, full offline outbox, CI/E2E, OAuth |

**Stack (actual):** React Query + Context (not Redux), CSS Modules (not Tailwind), **Giphy** (`frontend/src/config/env.ts`).

**Docs:** Treat this file + `docs/INTEGRATION.md` as integration truth. `docs/README.md` is the product overview; sprint sections there remain historical planning context.

---

## Implemented features

### Auth & users
- Register, login, forgot/reset password, protected routes, `/auth/me` session restore
- User search → start DM (`NewDmModal`)
- **Session refresh:** `withCredentials` on Axios, `POST /auth/refresh`, 401 retry interceptor, init refresh in `AuthContext`
- Settings route `/settings`, profile patch, `logout-all`

### Sidebar & navigation
- **Favorites** section (starred channels + DMs) — always first in sidebar
- **Channels** + **Direct Messages** with per-row **⋯** menu (`ChatSidebarMenu`)
- **DM menu:** Favorite, Close DM (hidden until new message)
- **Channel menu:** Favorite, Leave group (confirm)
- **Jump to…** — `JumpToSearch`, `Cmd/Ctrl+K`, user search + start DM
- **404** — `NotFoundPage` for unknown routes
- **Responsive** — mobile chat shell, calls, settings tabs, composer safe areas

### Chats & messaging
- DM create/list, unread badges, paginated history, real-time `message:new`
- Text / image / file messages, reply, edit, delete, forward
- Reactions, pin/unpin, pins panel, date dividers, unread divider, drafts
- **Threads** — `ThreadPanel` for DM and GROUP
- Sub-nav: Messages · Files & Media · Pins · Call History
- Socket reconnect hardening

### Groups (Phase 2 — done)
- **Create group** — `CreateGroupModal` (title, avatar, members, public/private)
- **Sidebar onboarding** — Channels **+** → Create Group / Join Public Channels picker
- **Group info panel** — members, role badges, promote/demote, remove (Owner/Admin/Mod), leave with confirmation
- **Role-based UI** — Owner/Admin edit basic info & visibility; Moderator/Member read-only; add-people input Owner/Admin only
- **Public join** — discoverable public groups, join flow, system message + push preview
- **List refresh** — group removed from sidebar immediately after leave
- **GROUP_V1 E2EE** — new groups default to encrypted sender-key mode

### Mentions & notifications (done)
- **`@user`** — composer autocomplete, stream highlight, push to mentioned user only (bypasses active-view suppression)
- **`@all`** — Owner/Admin only; notifies all members except sender
- **Normal messages** — all members (respects mute); no `@` tags in push preview body
- E2EE groups carry `mentions` in encrypted `contentMeta` for correct server-side routing

### Real-time & receipts
- Socket: subscribe, typing, presence, delivered/read receipts (HTTP + socket)
- `ConversationRealtimeSync` for sidebar previews
- Offline outbox **partial** (`frontend/src/features/sync/outbox.ts`)

### Media & composer
- Multi-file upload, grouped attachments, image lightbox, PDF/DOCX/XLS preview
- Giphy GIF picker
- Voice notes: record → upload → play
- Polls: create, render, vote

### Calls (1:1 + group — done)
- Backend `call:*` + `groupCall:*` signaling, call history API, group call system messages
- **1:1:** `CallProvider`, incoming modal, overlay (mute, camera, captions), history cards
- **Group:** `GroupCallProvider`, join existing session, split UI (incoming prompt vs active overlay), synced timer via server `startedAt`, video fallback when no camera
- Optional TURN: `docs/coturn.md`

### Search & link previews (done)
| Item | Backend | Frontend |
|------|---------|----------|
| In-chat search | `GET /chats/:chatId/messages/search` | `ChatSearchDialog`, Cmd/Ctrl+K |
| Link preview OG | SSRF-safe fetch + cache | `LinkPreviewBlock`, composer + stream |

### E2EE
- **DM_V1:** mandatory for all direct chats; Web Crypto P-256 + AES-GCM; no UI toggle
- **GROUP_V1:** sender-key envelopes for group text/attachments; optional group call media key distribution
- Recovery in Settings → Privacy; legacy plaintext messages still render

### PWA (Phase 10.1 — done)
- `vite-plugin-pwa` + custom `frontend/src/sw.ts` (Workbox precache, offline strategies, push)
- Manifest, icons, install prompt (`PwaInstallPrompt`), “Update available” toast via `registerSW`

### Settings, moderation, push
- Profile, avatar, user settings, mute chat, block/report
- Web Push: VAPID + `POST /devices/web`; mention-aware notification router

### Backend-only (API exists, minimal/no UI)
- **Friends** — `/friends/*` ready; no frontend friends list or request flow

### Tests & CI
- Backend: auth, sockets, uploads, E2EE, search, link-preview, notifications (~18+ test files)
- Frontend: `features/e2ee/crypto.test.ts`
- **CI:** no `.github/workflows` yet

---

## Missing or incomplete

| Area | Gap | Priority |
|------|-----|----------|
| **Friends** | No friends list, requests, accept/reject UI | High |
| **Global search** | Jump to works; could add more filters / recent items | Low |
| **Outbox** | IndexedDB outbox; full reconnect flush + multi-tab sync incomplete | Medium |
| **CI / E2E** | No GitHub Actions, no Playwright | Medium |
| **OAuth** | Google/GitHub login not implemented | Low |
| **Group invites** | Invite links / approval flow | Low |
| **Search scale** | ILIKE only; Meilisearch optional upgrade | Low |

---

## Phase status (integration checklist)

| Phase | Goal | Status |
|-------|------|--------|
| **0** Session refresh | Silent renew, 401 retry, logout-all | **Done** |
| **1** Settings & profile | `/settings`, mute, block/report | **Done** |
| **2** Friends & groups | Group CRUD UI, roles, public join | **Done** (friends UI pending) |
| **3** Polls | Composer → vote | **Done** |
| **4** Web Push | SW + device registration + mention routing | **Done** (needs VAPID in prod) |
| **5** Voice notes | Record → upload → play | **Done** |
| **6** WebRTC calls | 1:1 + group signaling + in-call UI | **Done** |
| **7** Client E2EE | DM_V1 + GROUP_V1 | **Done** |
| **8** Offline outbox | Queue, socket ack, multi-tab | **Partial** |
| **9** Search & link previews | In-chat search + OG cards | **Done** |
| **10** PWA, CI, scale | Manifest, SW, Actions, Redis adapter | **PWA done**; CI pending |

---

## Quick reference — key paths

| Area | Path |
|------|------|
| API routes | `backend/src/routes/index.ts` |
| Socket handlers | `backend/src/sockets/handlers.ts` |
| Notification router | `backend/src/lib/notification-router.ts` |
| Group system messages | `backend/src/lib/groups/group-system-message.ts` |
| Message UI | `frontend/src/features/chat/components/MessageStream.tsx` |
| Composer + mentions | `frontend/src/features/chat/components/MessageComposer.tsx` |
| Group info / roles | `frontend/src/features/chat/components/GroupInfoPanel.tsx` |
| Group calls | `frontend/src/features/calls/GroupCallProvider.tsx` |
| PWA / SW | `frontend/src/sw.ts`, `frontend/vite.config.ts`, `frontend/src/features/pwa/` |
| E2EE | `frontend/src/features/e2ee/` |
| Integration guide | `docs/INTEGRATION.md` |
| Development setup | `docs/DEVELOPMENT.md` |
| Sidebar menu | `frontend/src/features/chat/components/ChatSidebarMenu.tsx` |
| Sidebar layout | `frontend/src/layouts/MainLayout.tsx` |

---

## Recommended next integration order

1. **Friends UI** — wire `/friends/*` (highest UX gap vs backend capability).
2. **Phase 8** — finish outbox flush + reconnect sync.
4. **Phase 10 CI** — GitHub Actions (lint, test, build) + Playwright smoke tests.
5. **Polish** — mobile responsive pass, dark/light theme toggle if desired.

---

## Advanced feature suggestions

Features that would move the product toward production-grade / enterprise chat:

| Feature | Why | Complexity |
|---------|-----|------------|
| **SFU / selective forwarding unit** | Group video calls beyond ~4–6 participants (mesh WebRTC does not scale) | High |
| **Screen sharing** | 1:1 and group calls — expected in modern chat | Medium |
| **Scheduled messages** | Send later; drafts already exist client-side | Medium |
| **Group invite links** | Shareable URL with expiry / approval queue | Medium |
| **Read receipts in groups** | Per-member seen state (privacy toggle) | Medium |
| **Message pinning limits + admin controls** | Cap pins, restrict who can pin | Low |
| **Full-text search (Meilisearch)** | Faster search, better ranking; E2EE chats stay client-side or metadata-only | High |
| **OAuth (Google / GitHub)** | Faster onboarding | Medium |
| **Admin audit log** | Who removed/banned/promoted whom | Medium |
| **Rate limiting dashboard** | Ops visibility for abuse | Low |
| **Multi-region / Redis cluster** | Horizontal socket scaling at scale | High |
| **End-to-end encrypted backups** | Cross-device history restore for groups | High |
| **Disappearing messages** | TTL per chat or per message | Medium |
| **Reactions summary / poll analytics** | Group engagement insights | Low |
| **Bot / webhook API** | Integrations (Slack-style) | High |

---

## UI / UX adjustment suggestions

Based on current CSS Modules layout and recent group/call work:

### High impact
1. **Friends entry point** — sidebar section or modal for pending requests, accept/reject, start DM.
3. **Mobile navigation** — stack list → thread → details on narrow viewports; group call overlay controls sized for touch (≥ 44px targets).
4. **Group call participant grid** — show avatars/video tiles per participant instead of audio-only placeholder when multiple users join.
5. **Mention badges in sidebar** — subtle `@` or highlight on chats with unread mentions.

### Medium impact
6. **Pinned chats** — pin DMs/groups to top of sidebar lists.
7. **Consistent empty states** — shared component for “No messages”, “No calls”, “No public groups” with primary CTA.
8. **Loading skeletons** — chat list and message thread (reduce layout shift on slow networks).
9. **Theme toggle** — light/dark mode using existing CSS variables in `variables.css`.
10. **Call history actions** — wire “Call Again” / “Info” chips in group history cards to actual handlers.

### Polish
11. **Reduced motion** — respect `prefers-reduced-motion` for Framer Motion toasts and modals.
12. **Focus management** — trap focus in modals (Create Group, Leave confirm, incoming call).
13. **Group sidebar icons** — already using `#` / lock; consider tooltip on hover for visibility type.
14. **Composer mention menu** — keyboard navigation (↑/↓/Enter) for `@` suggestions.
15. **Offline banner** — visible reconnecting state when socket drops (pairs with outbox work).

---

## docs/README.md alignment (current)

| Claim | Repo reality |
|-------|--------------|
| Redux Toolkit | React Query + Context |
| Tailwind CSS | CSS Modules |
| Tenor GIFs | Giphy |
| Message search | In-chat **yes**; global jump **no** |
| Group chats + roles | **Implemented** |
| E2EE private chats | **DM_V1 implemented** |
| Group E2EE | **GROUP_V1 implemented** (default on create) |
| PWA | **Implemented** |
| Friends system | Backend only |
| Voice / calls / polls / mentions | **Implemented** |

---

## Related docs

- `docs/README.md` — product overview, privacy commitment, sprint history
- `frontend/README.md` — frontend setup and structure
- `backend/README.md` — API, sockets, env
- `docs/INTEGRATION.md` — auth, proxy, socket contract
- `docs/coturn.md` — TURN setup for calls
- `backend/src/docs/e2ee-boundary.md` — E2EE server boundaries
