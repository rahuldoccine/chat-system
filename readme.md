# **Chat Module — Secure E2EE Real-Time Messaging** 🗨️  

A **full-stack chat application** (React + Express + PostgreSQL + Socket.IO) with **mandatory E2EE for direct messages**, **group sender-key encryption**, **WebRTC calls**, **PWA**, and a **Slack-style sidebar** (Favorites, Channels, Direct Messages).

> **What is implemented today:** [docs/CODEBASE_FEATURE_ANALYSIS.md](docs/CODEBASE_FEATURE_ANALYSIS.md)  
> **Run locally:** [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) · **API ↔ UI wiring:** [docs/INTEGRATION.md](docs/INTEGRATION.md)

---

## **🚀 Quick start**

```bash
# Terminal 1 — backend
cd backend && cp .env.example .env
# Set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
npm install && npm run db:generate && npm run db:migrate:dev && npm run dev

# Terminal 2 — frontend
cd frontend && cp .env.example .env
npm install && npm run dev
```

Open **http://localhost:5173** · API **http://localhost:4000/api/v1** · Swagger **http://localhost:4000/api/docs** (when enabled).

**Optional dev seed data** (dummy users + groups):

```bash
cd backend && npm run db:seed-test
# Remove later: CONFIRM=YES npm run db:remove-seed
```

---

## **📖 Documentation**

| Document | Description |
|----------|-------------|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, env, npm scripts, test seed, sidebar APIs |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | Auth, Axios, React Query, Socket.IO, routes |
| [docs/CODEBASE_FEATURE_ANALYSIS.md](docs/CODEBASE_FEATURE_ANALYSIS.md) | Feature matrix & gaps |
| [backend/README.md](backend/README.md) | API modules, sockets, database |
| [frontend/README.md](frontend/README.md) | UI features, structure, PWA |
| [docs/coturn.md](docs/coturn.md) | TURN server for calls |

---

## **✨ Highlights (current build)**

- **Sidebar:** Favorites (channels + DMs) → Channels → Direct Messages; per-chat **⋯** menu
- **DM settings:** Favorite, Close DM (reappears on new messages)
- **Channel settings:** Favorite, Leave group (with confirmation)
- **Jump to…** (`⌘K` / `Ctrl+K`) — search chats and users, start DMs
- **404 page** for unknown routes
- **Responsive UI** — mobile-friendly chat, calls, settings, composer
- **E2EE** — `DM_V1` (all DMs), `GROUP_V1` (new groups)
- **Calls** — 1:1 and group audio/video (WebRTC + Socket signaling)
- **PWA** — installable app, offline shell, Web Push

---

## **📚 Table of Contents**  
- [Quick start](#-quick-start)  
- [Documentation](#-documentation)  
- [Pre-requirements](#-pre-requirements)  
- [Backend (Required)](#-backend-required)  
- [Technical Plan: How to Build](#-technical-plan-how-to-build)  
- [Sprint-wise Build Plan](#-sprint-wise-build-plan)  
- [Suggested Folder Structure](#-suggested-folder-structure)  
- [Database Schema Plan](#-database-schema-plan)  
- [API Endpoint Checklist](#-api-endpoint-checklist)  
- [Features](#-features)  
- [Advanced UI/UX (Design Spec)](#-advanced-uiux-design-spec)  
- [Privacy & Encryption Commitment](#-privacy--encryption-commitment)  
- [Who Can Use This Chat App?](#who-can-use-this-chat-app)  
- [Tech Stack](#-tech-stack)  
- [Roadmap (Planned / Future)](#-roadmap-planned--future)  

---
## **✅ Pre-requirements**  

Before running the project, make sure you have these ready:

- **Node.js** (LTS recommended) + **npm**  
- **Database** – PostgreSQL (recommended) or your configured DB for Prisma  
- **Firebase Project** – For push notifications (and `firebase-admin` credentials)  
- **Local Storage (Uploads Folder)** – Media/files are stored on the server filesystem (configure upload path + permissions)  
- **Email SMTP Credentials** – For OTP/MFA and password reset emails (Nodemailer)  
- **Environment Files** – Backend + frontend `.env` files configured (see Getting Started)  

---
## **🧩 Backend (Required)**  

For this chat module, a backend is **required** to deliver **auth**, **real-time messaging**, **E2EE-safe storage**, **local uploads**, and **push notifications** in a secure way.

### **Why a Backend is Needed**  
- **Authentication**: signup/login, password reset, JWT sessions/refresh, revoke sessions (logout all devices).  
- **Authorization**: chat membership checks, group roles (admin/mod), block/report enforcement.  
- **Real-time messaging**: Socket.IO rooms, message events, delivery/read receipts, typing/presence, reconnect handling.  
- **Database**: users, friends, chats, messages, reactions, polls, call history, receipts, settings, device tokens.  
- **E2EE workflows**: server stores **encrypted payloads + metadata only** (never plaintext).  
- **Local uploads**: validate type/size, store on server filesystem, generate safe URLs, optional cleanup jobs.  
- **Push notifications**: server sends notifications through Firebase Admin.  
- **Security**: input validation, rate limiting, abuse prevention, audit logs where needed.  

### **Backend Scope (Detailed)**  

#### **1) REST API (Express)**  
- **Auth**: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/forgot-password`, `/auth/reset-password`  
- **Users & Profiles**: `/users/me`, `/users/:id`, `/users/search`
- **Friends**: `/friends/request`, `/friends/accept`, `/friends/remove`  
- **Chats & Groups**: `/chats`, `/chats/:id`, `/groups`, `/groups/:id/members`, `/groups/:id/roles`  
- **Messages**: `/messages`, `/chats/:id/messages`, `/messages/:id/reactions`, `/messages/:id/pin`  
- **Uploads (Local)**: `/uploads` (multipart), `/files/:key` (authorized download/stream)  

#### **2) Socket.IO Layer**  
- **Connection**: JWT auth in handshake, map sockets ↔ userId, handle reconnects  
- **Rooms**: join/leave per chatId, broadcast presence/typing efficiently  
- **Events (example)**: `message:send`, `message:delivered`, `message:read`, `message:edit`, `message:delete`, `typing:start`, `typing:stop`, `presence:update`  

#### **3) Database (Prisma + PostgreSQL)**  
- **Core models**: User, Session/RefreshToken, Chat, ChatMember, Message, Reaction, Receipt, Friend, Block, Report, Poll, CallLog, DeviceToken  
- **Indexes**: `(chatId, createdAt)` for pagination; optional full-text index for message search  

#### **4) Local Upload Storage**  
- Store files under a dedicated directory (example: `uploads/`) with **type/size validation** and **randomized file names**.  
- Prefer **authorized access** (signed URL or token-based route) over fully public static hosting for private chats.  

#### **5) Background Utilities**  
- Email OTP/MFA + password reset (Nodemailer)  
- Push notification fan-out (Firebase Admin)  
- Optional: cleanup expired sessions, old temp uploads, media processing  

### **Can You Build Without a Backend?**  
Only for a **very limited demo**. You would have to replace most backend responsibilities with a BaaS (e.g., Firebase/Auth/Firestore/Storage) and you’ll lose control over: **Socket.IO flows**, **local uploads**, **fine-grained authorization**, and parts of the **E2EE key/recovery design**.

---
## **🛠️ Technical Plan: How to Build**  

This section separates the build into clear technical documents so you can implement it step by step.

### **Build Documents**  
- **Sprint-wise Build Plan** – what to build first, second, and next  
- **Suggested Folder Structure** – how to organize frontend and backend code  
- **Database Schema Plan** – core models and relationships  
- **API Endpoint Checklist** – REST routes and socket events to implement  

---
## **📅 Sprint-wise Build Plan**  

### **Sprint 1: Foundation Setup**  
- Create `frontend/` and `backend/` apps.  
- Configure ESLint, Prettier, env files, and shared conventions.  
- Set up PostgreSQL, Prisma, and first migration.  
- Prepare `uploads/` local storage directory.  

### **Sprint 2: Auth & Session Management**  
- Build register, login, refresh token, logout, logout-all, forgot password, reset password.  
- Hash passwords with `bcryptjs`.  
- Implement JWT access/refresh tokens and frontend protected routes.  

### **Sprint 3: Core Chat Models & APIs**  
- Create DB models: `User`, `Chat`, `ChatMember`, `Message`, `Receipt`, `Reaction`.  
- Build chat list, chat details, and paginated message history APIs.  
- Build basic chat list and conversation UI in React.  

### **Sprint 4: Real-Time Messaging**  
- Set up Socket.IO auth handshake.  
- Implement message send/receive, delivery receipts, read receipts, typing, and presence.  
- Add optimistic UI handling in frontend.  

### **Sprint 5: Friends, Groups, and Roles**  
- Add friend request / accept / remove flow.  
- Build group create, member manage, admin/mod permissions.  
- Build group member and settings UI.  

### **Sprint 6: Local Uploads & Media**  
- Implement `multer` upload APIs.  
- Validate file size/type and secure file access.  
- Add attachment picker, progress, retry, cancel, preview.  

### **Sprint 7: Notifications & Reliability**  
- Store Firebase device tokens.  
- Send push notifications for offline users.  
- Add reconnect handling, queued messages, last seen, and mute settings.  

### **Sprint 8: E2EE for Private Chats**  
- Generate client-side keys.  
- Encrypt private messages and voice notes before sending.  
- Store encrypted payloads only.  
- Add secure key recovery via email/MFA.  

### **Sprint 9: Calling, Security, and Polish**  
- Implement WebRTC calling with Socket.IO signaling.  
- Add rate limiting, validation, moderation, and audit logs.  
- Finalize responsive UI, accessibility, testing, and deployment.  

---
## **📁 Suggested Folder Structure**  

```text
chat-module/
  frontend/
    src/
      app/
      components/
      features/
        auth/
        chats/
        messages/
        groups/
        calls/
        settings/
      hooks/
      services/
      store/
      utils/
      pages/
  backend/
    src/
      config/
      modules/
        auth/
        users/
        friends/
        chats/
        messages/
        groups/
        uploads/
        notifications/
        calls/
      middleware/
      sockets/
      utils/
      prisma/
    uploads/
```

---
## **🗄️ Database Schema Plan**  

### **Core Models**  
- `User` – account, profile, auth settings  
- `Session` – refresh tokens / device sessions  
- `Chat` – private or group chat metadata  
- `ChatMember` – user membership and role inside a chat  
- `Message` – encrypted/plain payload metadata, sender, chat, timestamps  
- `Receipt` – delivered/read state per message per user  
- `Reaction` – emoji reactions on messages  
- `Friend` – friend relationships and request state  
- `Block` – blocked user relationships  
- `Poll` / `PollOption` / `PollVote` – polling feature  
- `CallLog` – call history records  
- `DeviceToken` – Firebase push tokens  

### **Important Relationships**  
- One `Chat` has many `ChatMember` entries  
- One `Chat` has many `Message` entries  
- One `Message` has many `Receipt` and `Reaction` entries  
- One `User` can belong to many chats and own many sessions/devices  

### **Important Indexes**  
- `(chatId, createdAt)` for message pagination  
- `(userId, createdAt)` for notifications/call logs  
- Search index for message search if needed  

---
## **📡 API Endpoint Checklist**  

### **Auth**  
- `POST /auth/register`  
- `POST /auth/login`  
- `POST /auth/refresh`  
- `POST /auth/logout`  
- `POST /auth/logout-all`  
- `POST /auth/forgot-password`  
- `POST /auth/reset-password`  

### **Users**  
- `GET /users/me`  
- `GET /users/:id`  
- `GET /users/search`  
- `PATCH /users/me`  

### **Friends**  
- `POST /friends/request`  
- `POST /friends/accept`  
- `DELETE /friends/remove`  

### **Chats & Messages**  
- `GET /chats`  
- `POST /chats`  
- `GET /chats/:id`  
- `GET /chats/:id/messages`  
- `POST /messages`  
- `PATCH /messages/:id`  
- `DELETE /messages/:id`  
- `POST /messages/:id/reactions`  
- `POST /messages/:id/pin`  

### **Groups**  
- `POST /groups`  
- `PATCH /groups/:id`  
- `POST /groups/:id/members`  
- `DELETE /groups/:id/members/:userId`  
- `PATCH /groups/:id/roles/:userId`  

### **Uploads**  
- `POST /uploads`  
- `GET /files/:key`  

### **Socket Events**  
- `message:send`  
- `message:delivered`  
- `message:read`  
- `message:edit`  
- `message:delete`  
- `typing:start`  
- `typing:stop`  
- `presence:update`  
- `call:offer`  
- `call:answer`  
- `call:ice-candidate`  
- `call:end`  

---
## **🚀 Features**  

### 💬 **Chat & Messaging**  
- **Real-time Messaging** – Instantly send and receive messages.  
- **Voice Notes** – Record and send encrypted voice messages in private chats (not encrypted in group chats). 
- **Typing Indicators** – See when someone is typing (supports multiple users typing simultaneously in group chats).
- **Delivery & Read Receipts** – Sent / delivered / seen status for messages.  
- **Unread Counts** – Per-chat unread badges with “mark as read” behavior.  
- **Message Editing** – Edit messages after sending (with an edit indicator).  
- **Message Reactions** – React to messages with emojis (double-tap to like/unlike).  
- **Message Deletion** – Delete messages after sending.  
- **Message Replies** – Reply to specific messages in a chat, whether sent by you or others.
- **Message Search** – Search within chats for text content.  
- **Pinned Messages** – Pin important messages in a chat.  
- **Forwarding & Sharing** – Forward messages to other chats/users.  
- **Message Link Previews** – Rich previews for shared links.  


### 📞 **Audio & Video Calling**
- **Peer-to-Peer Calls** – High-quality voice and video calls (WebRTC) for 1:1 and groups.
- **Group Calls** – Multiple users join the same audio/video session with join prompts and in-call controls.
- **Call History** – View past call logs with duration, status, and filters (1:1 and group).

### 📢 **Notifications & Presence**  
- **Push Notifications** – Stay updated with real-time alerts (powered by Firebase).  
- **User Presence** – See who’s online in real time.
- **Last Seen** – Show last active time (with privacy controls).  
- **Mute Chats** – Mute notifications per chat/group.  

### 🤝 **Social Features**  
- **Friends System** – Add friends and chat with them *(backend API ready; frontend UI pending)*.  
- **Group Chats** – Create and participate in group conversations *(implemented)*.  
- **Group Roles & Permissions** – Owner/Admin/Mod/Member controls (add/remove members, promote/demote) *(implemented)*.  
- **Group Invites** – Invite links / join via invite (optional approval) *(public join implemented; invite links planned)*.  
- **@Mentions** – `@user` and `@all` (admin) with targeted push notifications *(implemented)*.  
- **Polling** – Create polls with single/multiple voting options.  

### 👤 **Profile & Account**  
- **Profile Management** – Avatar, name, bio/status message.  
- **Session Management** – Logout from all devices / revoke sessions.  
- **Forgot Password** – Password reset via email OTP/link.  

### 🧰 **Safety & Moderation**  
- **Block Users** – Block/unblock users to stop messages.  
- **Report Users/Content** – Basic reporting flow for abuse/spam.  

### 📁 **Media & File Sharing**  
- **GIF Support** – Send animated GIFs (powered by **Giphy**).  
- **File Sharing** – Send and receive files securely.  

### 🔒 **Privacy & Security**  
- **End-to-End Encryption (E2EE)** – Secure messages with advanced encryption.  
- **Private Key Recovery** – Retrieve your encryption key with MFA-protected email verification.  

### 🛠️ **Other Features**  
- **PWA Support** – Install as a Progressive Web App: manifest, offline caching, install prompt, update toast *(implemented)*.  
- **Jump to / in-chat search** – Global jump (`Cmd/Ctrl+K`) plus search inside the open conversation.  
- **Message Threads** – Reply threads in DMs and groups.  

---

## **✨ Advanced UI/UX (Design Spec)**  

This section describes a **production-grade UI/UX** direction for the React.js frontend, aligned with **normal login** and **local media uploads**.

### **Product Principles**  
- **Speed first** – Instant feedback for send/upload, optimistic UI, and smooth transitions.  
- **Clarity** – Strong hierarchy: chat list → conversation → details.  
- **Privacy by design** – Clear E2EE indicators and safe defaults.  
- **Consistency** – Reusable components and predictable patterns.  
- **Accessibility** – Keyboard-first flows, readable contrast, and screen reader support.  

### **Information Architecture**  
- **Auth**: Login, Register, Forgot Password, Reset Password  
- **Main App Layout**:  
  - **Left**: Chat list + search + filters  
  - **Center**: Conversation thread  
  - **Right (optional drawer)**: Chat details (members, media, settings)  

### **Core Screens (Must Have)**  
- **Login / Register**: Minimal, distraction-free, clear validation, “show password”, loading states.  
- **Chat List**: Unread badges, last message preview, mute indicator, pinned chats, presence dot.  
- **Conversation**:  
  - Date separators, “new messages” divider, edited indicator, reply preview, reactions.  
  - Message actions on hover/long-press: reply, react, forward, edit, delete, copy.  
- **Composer**: Attachments, GIF picker, emoji picker, voice note record, send button states.  
- **Chat Details**: Members/roles, mute, search in chat, pinned messages, shared media/files.  
- **Profile & Settings**: Avatar, status/bio, privacy toggles (last seen, read receipts), sessions.  

### **Micro-interactions & Motion**  
- **Typing indicator**: subtle, non-janky, visible for multiple users.  
- **Message send**: optimistic bubble → delivered → seen tick animation.  
- **Upload UX (Local Storage)**: progress bar per file, retry, cancel, file type badges.  
- **Toasts**: compact and actionable (“Copied”, “Upload failed – Retry”).  

### **UX for States (No Dead Ends)**  
- **Empty states**: “No chats yet”, “No results”, “No pinned messages” with clear CTA.  
- **Loading**: skeletons for chat list and message thread (avoid spinners only).  
- **Offline**: banner + queued messages + “reconnecting…” indicator.  
- **Errors**: inline + recovery actions (retry, resend, re-upload).  

### **Responsive Behavior**  
- **Desktop**: 3-column layout (list / thread / details).  
- **Tablet**: 2-column (list / thread) with details as a slide-over.  
- **Mobile**: stack navigation (list → thread → details) with bottom sheet actions.  

### **Design System (Suggested)**  
- **Typography**: 14–16px base, clear scale for headings and metadata.  
- **Color**: Light + dark mode, accessible contrast, semantic colors (success/warn/error).  
- **Spacing**: 8px grid, consistent paddings, touch targets ≥ 44px on mobile.  
- **Components**: Button, IconButton, Input, Modal, Drawer, Tooltip, Dropdown, Toast, Skeleton, Avatar, Badge, Tabs.  

### **Accessibility Checklist**  
- Full keyboard navigation (Tab/Shift+Tab), focus rings, ESC to close modals/drawers.  
- ARIA labels for icon-only buttons, screen-reader announcements for new messages.  
- Reduced motion support and proper color contrast ratios.  

---
## **🔐 Privacy & Encryption Commitment**  

At this project [Mernchat](https://mernchat.in), i have taken **privacy and security** seriously. The app is **built, designed, and structured** with user privacy in mind, ensuring that **certain messages remain completely inaccessible-even to me as a developer**.  

### **End-to-End Encryption (E2EE)**  

**Implementation status (this repo):** Mandatory E2EE for all direct chats (`DM_V1`). Keys are generated automatically on register/login (`frontend/src/features/e2ee/`). There is no UI to disable encryption. Legacy plaintext messages remain visible; new messages are encrypted client-side.

### **End-to-End Encryption (E2EE) — design notes**  
Private **one-on-one text messages and voice notes** are **end-to-end encrypted** using **AES-256-GCM + ECDH**. This means:  

✅ **No one-including me as the developer-can access your private chats or private voice notes.**  
✅ **Text messages sent in private chats (between two users) and voice notes sent in private chats (between two users) are encrypted at the sender’s device and only decrypted on the recipient’s device.**  
✅ **Even if I access the database directly, I cannot read or retrieve private messages or private voice notes in plain text/data**  

For **full transparency**, here’s a snapshot of how private messages and private voice notes are stored in the database-fully encrypted and unreadable to anyone, including myself.  

### **What’s Not E2EE?**  

❌ **Audio & video calls (WebRTC)** — signaling only; media path is not E2EE (group call media key distribution is optional/experimental)

Direct chats use mandatory client E2EE (`DM_V1`) for text, voice notes, and uploaded attachments. **Group chats** use **GROUP_V1** sender-key encryption for message bodies and attachments on newly created groups.

At [Mernchat](https://mernchat.in), i am committed to transparency and security. As i continue improving, my aim is to enhance encryption features for even greater privacy in future updates.

---

## **Who Can Use This Chat App?**  

✔️ **Startups & Teams** – Secure & private team collaboration 🔐  
✔️ **Developers** – Learn how to build a **real-time chat app** 👨‍💻  
✔️ **Open-Source Enthusiasts** – Contribute & improve the project 🚀  
✔️ **Personal Use** – Chat privately with friends & family 💬  

---

## **🛠️ Tech Stack**  

### **Frontend**  
- **⚛️ React 19 + Vite** – SPA UI with HMR.  
- **🔄 TanStack React Query + React Context** – Server state and session/socket/call context.  
- **🔗 React Hook Form + Zod** – Form handling & schema validation.  
- **🔄 Socket.IO Client** – Real-time communication.  
- **🎥 Framer Motion** – Animations & transitions.  
- **💅 CSS Modules** – Scoped component styles (design tokens in `variables.css`).  
- **📱 vite-plugin-pwa + Workbox** – PWA manifest, service worker, offline cache.  
- **💬 Emoji-Picker-React + Giphy** – Interactive media in chat.  

### **Backend**  
- **🟢 Node.js + Express** – Scalable backend API.  
- **🔄 Socket.IO** – Real-time bidirectional communication.  
- **🗄️ Prisma ORM** – Type-safe database management.  
- **🔐 JWT Authentication (jsonwebtoken)** – Secure authentication.  
- **🗂️ Local Storage** – Store uploaded images/files on the server filesystem.  
- **📧 Nodemailer** – Email notifications & MFA verification.  
- **🔥 Firebase Admin SDK** – Push notifications.  
- **🛡️ Helmet** – Security headers for protection.  
- **📝 Pino** – Structured HTTP logging.  
- **🍪 Cookie-Parser** – Secure cookie handling.  
- **🛠️ Multer** – File uploads.  
- **🔄 CORS** – Cross-origin requests.  
- **🛠️ UUID** – Unique ID generation.  
- **⚙️ dotenv** – Environment variable management.  

---
## **🗺️ Roadmap (Planned / Future)**  
- **Friends UI** – Wire existing `/friends/*` API into sidebar (requests, accept/reject).  
- **OAuth Integration (Google/GitHub)** – Social login.  
- **SFU for group video** – Scale beyond mesh WebRTC for large groups.  
- **Screen sharing** – 1:1 and group calls.  
- **CI / E2E** – GitHub Actions + Playwright smoke tests.  
- **Full offline outbox** – Reliable send queue on reconnect.  
- **Group invite links** – Shareable URLs with optional approval.