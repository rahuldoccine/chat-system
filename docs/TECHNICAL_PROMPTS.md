# Chat Module Technical Prompts

This file contains detailed AI prompts for planning and building a production-ready chat module. These prompts are intentionally verbose so the AI has enough product, architecture, and engineering context to produce high-quality technical guidance instead of shallow bullet points.

---
## How To Use This File

- Use the **High-Level Master Prompt** first if you want architecture, scope, dependencies, risks, and delivery order.
- Use the **Backend Sprint Prompts** when building the server in stages.
- Use the **Frontend Sprint Prompts** when building the React application in stages.
- Use the **Phase-Wise Full-Stack Prompts** when you want frontend and backend guidance together for one milestone.
- Ask the AI to return results in a strict structure: `Architecture`, `Data Model`, `API`, `Socket Events`, `Security`, `Edge Cases`, `Testing`, `Implementation Steps`.

---
## High-Level Master Prompt

```text
Act as a senior full-stack architect and technical lead. I want you to design and guide the implementation of a production-ready real-time chat module.

Project context:
- Frontend must be React.js
- Backend must be Node.js + Express + Socket.IO
- Database must be PostgreSQL with Prisma ORM
- Authentication is normal auth only: register, login, forgot password, reset password, logout, logout-all-devices
- OAuth is not part of the current scope
- File and media uploads must use local server storage, not Cloudinary or S3
- Push notifications should use Firebase
- Messages are stored as plaintext in the database (`Message.ciphertext` field)
- WebRTC should be used for audio/video calling, with Socket.IO used only for signaling

Functional requirements:
- Private chats and group chats
- Real-time messaging
- Delivery receipts and read receipts
- Typing indicators
- Online presence and last seen
- Message edit/delete/reply/reaction/pin/search
- Friend request system
- Group member roles and permissions
- Polling
- File sharing and voice notes
- Push notifications
- Block/report flows
- Session management
- Responsive advanced UI/UX

Non-functional requirements:
- Modular and scalable architecture
- Strong validation and authorization
- Clear separation of concerns
- Good developer experience
- Secure defaults
- Production readiness

I do not want a generic answer. I want a real technical plan suitable for implementation.

Please provide:
1. Recommended system architecture
2. Backend module design
3. Frontend module design
4. Suggested folder structure
5. Prisma schema planning
6. REST API planning
7. Socket.IO event planning
8. Local upload architecture
9. Security checklist
10. Testing strategy
11. Sprint-wise build roadmap
12. MVP scope vs later scope
13. Known risks and technical trade-offs

Important instructions:
- Do not switch the frontend to Next.js
- Do not remove the backend
- Do not suggest cloud media storage as the default
- Keep the design practical for a solo developer or a small team
- Prefer clarity and implementation realism over overengineering
- Explain why each architectural decision is being made
```

---
## Backend Sprint Prompts

### Backend Sprint 1: Foundation, Standards, and Bootstrap

```text
Act as a senior backend engineer. I want you to design the initial backend foundation for a production-ready real-time chat system.

Tech stack:
- Node.js
- Express
- Socket.IO
- Prisma
- PostgreSQL
- JWT auth
- Local uploads

Scope for this sprint:
- Bootstrap the backend application
- Define backend folder/module structure
- Configure environment strategy
- Set up Express middlewares
- Set up Prisma and database connection
- Create centralized error handling
- Create request validation structure
- Prepare uploads directory

Technical expectations:
- Use modular architecture, not one giant app file
- Prefer feature-based or domain-based modules
- Show where middleware, services, controllers, schemas, and socket logic should live
- Include logging and config strategy
- Mention how dev/prod configuration should differ

Return the answer in this structure:
1. Goal of this sprint
2. Recommended backend architecture
3. Folder structure with explanation
4. Required dependencies and why
5. App bootstrap sequence
6. Config and environment design
7. Error handling and validation pattern
8. Local upload preparation approach
9. Risks and mistakes to avoid
10. Step-by-step implementation order
```

### Backend Sprint 2: Authentication and Session Security

```text
Act as a senior backend security engineer. Design the authentication subsystem for the chat backend.

Required features:
- Register
- Login
- Refresh access token
- Logout
- Logout from all devices
- Forgot password
- Reset password

Technical constraints:
- Use bcryptjs for password hashing
- Use JWT for access tokens and refresh tokens
- Refresh tokens or sessions must be persisted in the database
- Email-based password reset must use Nodemailer
- Support multiple devices and session revocation

Design expectations:
- Explain the difference between access token and refresh token responsibilities
- Explain how token rotation or session invalidation should work
- Define safe password reset flow
- Mention brute-force/rate-limit considerations
- Mention cookie vs header-based token trade-offs if relevant

Return:
1. Auth architecture
2. Data model changes needed
3. API endpoints and payload expectations
4. Service-layer responsibilities
5. Session management design
6. Security controls
7. Edge cases
8. Suggested implementation sequence
```

### Backend Sprint 3: Database and Domain Modeling

```text
Act as a senior database designer. Plan the backend schema for a chat system using Prisma and PostgreSQL.

Core entities expected:
- User
- Session
- Chat
- ChatMember
- Message
- Receipt
- Reaction
- Friend
- Block
- Report
- Poll
- PollOption
- PollVote
- CallLog
- DeviceToken

Business requirements:
- Support both private chats and group chats
- Track message delivery and read state per user
- Track group roles and permissions
- Track blocked users
- Support push notification tokens per device
- Support call history

Important constraints:
- Private message payload may be encrypted
- Message history must paginate efficiently
- Search may be added later, so note indexing strategy

Return:
1. Entity-by-entity schema planning
2. Relationships and cardinality
3. Private chat vs group chat modeling strategy
4. Suggested indexes
5. Data consistency concerns
6. Migration strategy advice
7. Common modeling mistakes to avoid
```

### Backend Sprint 4: REST API Design for Core Chat Features

```text
Act as a senior API architect. Design the REST API layer for the chat backend.

Feature areas:
- Users and profiles
- Friends
- Chats
- Groups
- Messages
- Reactions
- Pins
- Polls
- Uploads
- Settings

Expectations:
- Define route groups
- Explain what should be REST vs socket-driven
- Mention validation rules
- Mention authorization rules
- Mention pagination approach
- Mention idempotency where useful

Return:
1. Route map by module
2. Purpose of each endpoint
3. Request and response contract suggestions
4. Auth and authorization rules
5. Pagination and filtering strategy
6. Error handling conventions
7. Implementation priorities
```

### Backend Sprint 5: Socket.IO Real-Time Architecture

```text
Act as a senior real-time systems engineer. Design the Socket.IO layer for the chat backend.

Required real-time features:
- Authenticated socket connection
- Room subscription per chat
- Message send/receive
- Delivery receipts
- Read receipts
- Typing indicators
- Presence updates
- Reconnect and resync logic

Expectations:
- Explain connection lifecycle
- Explain how socket auth should work
- Explain how to map userId to multiple devices/sockets
- Explain what happens during reconnect
- Define which events should be acknowledged
- Mention ordering and duplication concerns

Return:
1. Socket architecture
2. Event catalog
3. Suggested payload shapes
4. Connection lifecycle rules
5. Reconnect and sync strategy
6. Scaling concerns
7. Testing strategy for socket flows
```

### Backend Sprint 6: Local File and Media Upload System

```text
Act as a senior backend engineer specializing in file systems and secure uploads.

I need local file/media uploads for the chat backend.

Requirements:
- Use multer or equivalent
- Support image, document, audio, and voice note uploads
- Save files locally on the server
- Use randomized file names
- Validate MIME type and file size
- Protect access for private chat files
- Keep the design practical for local/self-hosted deployment

Expectations:
- Explain upload flow end to end
- Explain temporary vs final storage strategy if needed
- Explain secure download/streaming approach
- Mention cleanup strategy
- Mention path traversal and content-type risks

Return:
1. Upload architecture
2. Module breakdown
3. Validation and storage strategy
4. Secure file access strategy
5. Voice note handling notes
6. Risks and mitigations
7. Implementation sequence
```

### Backend Sprint 7: Notifications, Presence, and Reliability

```text
Act as a senior backend engineer focused on reliability and event delivery.

I need to add production-oriented reliability features to the chat backend.

Features:
- Firebase push notifications
- Device token storage
- Presence tracking
- Last seen
- Offline delivery awareness
- Muted chat support
- Retry-aware notification behavior

Expectations:
- Explain when to send push notifications vs real-time socket messages
- Explain how to track per-device tokens
- Explain presence heartbeat or timeout strategy
- Explain reliability trade-offs

Return:
1. Notification architecture
2. Presence design
3. Last seen strategy
4. Muted chat implications
5. Failure and retry scenarios
6. Implementation order
```

### Backend Sprint 8: Calling, Moderation, and Production Hardening

```text
Act as a senior backend lead. Design the advanced backend phase for the chat system.

Required features:
- WebRTC signaling using Socket.IO
- Call offer/answer/reject/end events
- ICE candidate exchange
- Call history persistence
- Block user flows
- Report user/content flows
- Rate limiting
- Audit-friendly logs
- Production hardening

Expectations:
- Explain what belongs in signaling vs peer connection
- Explain moderation enforcement points
- Explain rate limiting areas
- Explain what should be logged and what should not

Return:
1. Call signaling architecture
2. Moderation architecture
3. Security and hardening checklist
4. Deployment readiness notes
5. Priority implementation order
```

---
## Frontend Sprint Prompts

### Frontend Sprint 1: App Foundation and Engineering Structure

```text
Act as a senior frontend architect. Design the React.js foundation for a production-ready chat application.

Constraints:
- Frontend must be React.js
- It should support responsive chat layouts
- It should be maintainable for a small team
- It must integrate cleanly with REST APIs and Socket.IO

Need guidance for:
- Project structure
- Routing
- Global state strategy
- API layer
- Socket integration layer
- UI component organization
- Theming and responsive foundation

Return:
1. Recommended architecture
2. Folder structure
3. State management boundaries
4. Shared UI system approach
5. Data fetching strategy
6. Socket integration strategy
7. Build order
```

### Frontend Sprint 2: Authentication UX and Session Handling

```text
Act as a senior frontend engineer focused on auth UX and app state.

I need to design the React frontend for:
- Login
- Register
- Forgot password
- Reset password
- Session restore on app load
- Protected routes
- Logout and logout-all-devices handling

Expectations:
- Include form validation
- Include loading, error, and success states
- Explain how auth state should persist
- Explain what happens when a token expires while the user is active

Return:
1. Screen architecture
2. Component breakdown
3. Form state strategy
4. Auth state flow
5. Edge cases
6. UX recommendations
```

### Frontend Sprint 3: Main Chat Layout and Screen Architecture

```text
Act as a senior product-oriented frontend architect. Design the main chat experience in React.js.

Required screens and areas:
- Chat list
- Conversation thread
- Composer
- Optional details panel
- Search
- Empty states
- Loading states
- Error states

UX constraints:
- Must work on desktop, tablet, and mobile
- Must feel modern and efficient
- Must support future scaling for groups, files, and calls

Return:
1. Screen hierarchy
2. Layout behavior by breakpoint
3. Major components and responsibilities
4. State ownership plan
5. UX state strategy
6. Accessibility notes
```

### Frontend Sprint 4: Real-Time Chat Experience

```text
Act as a senior frontend engineer. Design the React message experience for a real-time chat application.

Features:
- Real-time send and receive
- Optimistic UI
- Message reply
- Message edit and delete
- Reactions
- Delivery/read indicators
- Typing indicators
- Online presence

Expectations:
- Explain state transitions
- Explain how optimistic updates should reconcile with server truth
- Explain retry behavior for failed sends
- Explain rendering performance considerations for long message lists

Return:
1. Component interaction flow
2. State design
3. Optimistic UI strategy
4. Error and retry handling
5. Performance notes
6. UX behavior notes
```

### Frontend Sprint 5: Friends, Groups, and Permissions UI

```text
Act as a senior frontend product engineer. Design the collaboration and social UI layer for the chat app.

Features:
- Friend request flow
- Friends list
- Group creation
- Group member management
- Role-based admin controls
- Group settings
- Polling UI

Expectations:
- Explain how permissions affect UI visibility and actions
- Explain how to keep group management understandable for users
- Mention modal/drawer/inline patterns where appropriate

Return:
1. Screen and flow map
2. Component breakdown
3. Permission-aware UI rules
4. State considerations
5. UX recommendations
```

### Frontend Sprint 6: File Uploads, Media, and Voice Notes UX

```text
Act as a senior frontend engineer specializing in complex UI flows.

I need the React UI/UX design for:
- Local file uploads
- Image/file previews
- Upload progress
- Retry/cancel
- Protected file display/download
- Voice note recording and playback

Expectations:
- Explain upload state lifecycle
- Explain how to present errors without confusing the user
- Include accessibility and mobile considerations
- Include composer integration details

Return:
1. Upload UX architecture
2. Component plan
3. Upload state machine
4. Error handling strategy
5. Mobile and accessibility notes
```

### Frontend Sprint 7: Notifications, Presence, and Reliability UX

```text
Act as a senior frontend engineer with strong UX instincts.

Design the reliability-related UX for the chat app:
- Push notification permission prompt
- Offline state
- Reconnecting state
- Last seen
- Presence
- Unread badges
- Mute chat settings

Expectations:
- Explain which feedback should be passive vs interruptive
- Explain edge cases during reconnect
- Explain how presence should degrade gracefully

Return:
1. UX flow design
2. State handling approach
3. Edge cases
4. Recommended visual feedback patterns
```

### Frontend Sprint 8: Calling, Polish, Accessibility, and Final QA

```text
Act as a senior frontend lead. Design the final frontend milestone for the chat app.

Scope:
- WebRTC call UI
- Incoming/outgoing/ringing/active/ended states
- Final responsive polish
- Dark mode
- Accessibility improvements
- Loading, error, and empty state polish
- Final QA pass

Expectations:
- Explain how call UI should fit into the existing chat experience
- Explain important accessibility fixes
- Explain final polish items that create a production feel

Return:
1. Call UI flow
2. Final polish checklist
3. Accessibility checklist
4. QA checklist
5. Remaining risks
```

---
## Phase-Wise Full-Stack Prompts

### Phase 1: MVP Architecture Prompt

```text
Act as a senior full-stack technical lead. Help me define and build the MVP for a chat platform using React.js frontend and Node.js + Express + Socket.IO backend.

MVP scope:
- Register/login/logout
- Private chat only
- Message history
- Real-time send/receive
- Read receipts
- Typing indicators
- Basic profile

Please give me:
1. MVP architecture
2. Backend tasks
3. Frontend tasks
4. Required database models
5. Required APIs
6. Required socket events
7. Security basics
8. Suggested order of implementation
```

### Phase 2: Collaboration Expansion Prompt

```text
Act as a senior full-stack product engineer. Extend the chat MVP with collaboration features.

Features to add:
- Friends system
- Group chats
- Group roles and permissions
- Polls
- Message reactions
- Search
- Pinned messages

Please provide:
1. Schema changes
2. Backend module changes
3. Frontend screen and component changes
4. New API routes
5. New socket events
6. Edge cases and permission rules
7. Delivery order
```

### Phase 3: Media, Uploads, and Reliability Prompt

```text
Act as a senior full-stack systems engineer. Extend the chat app with media, uploads, and reliability improvements.

Features:
- Local file uploads
- Voice notes
- Push notifications
- Presence
- Last seen
- Reconnect handling
- Muted chats

Please provide:
1. Upload architecture
2. Notification architecture
3. Backend responsibilities
4. Frontend responsibilities
5. Reliability and retry logic
6. UX notes
7. Security notes
```

### Phase 4: Security and Moderation Prompt

```text
Act as a senior security architect. Extend the chat app with security and moderation features.

Features:
- Block/report flows
- Validation
- Rate limiting
- Audit-aware moderation
- Authorized file access

Please provide:
1. Secure architecture boundaries
2. Backend responsibilities
3. Frontend responsibilities
4. Data flow and trust boundaries
5. Recovery flow
6. Security checklist
7. Risks and trade-offs
```

### Phase 5: Production Readiness Prompt

```text
Act as a senior engineer responsible for taking this chat app to production.

Please prepare a production-readiness plan that includes:
- Automated testing strategy
- Manual QA plan
- Logging and monitoring
- Deployment architecture
- Database migration handling
- Backup and restore thinking
- HTTPS and reverse proxy setup
- Operational risks

Return:
1. Release checklist
2. Deployment plan
3. Testing plan
4. Monitoring plan
5. Rollback considerations
6. High-risk areas to watch after launch
```

---
## Prompt Writing Template

Use this template if you want to create more prompts in the same style:

```text
Act as a senior [role].

Context:
- [project type]
- [stack]
- [constraints]

Goal:
- [what this sprint/phase must achieve]

Functional requirements:
- [feature 1]
- [feature 2]

Non-functional requirements:
- [security]
- [scalability]
- [maintainability]

Important constraints:
- [do not change frontend stack]
- [do not remove backend]
- [do not use cloud uploads]

Please return:
1. Architecture
2. Data model impact
3. API impact
4. Socket impact
5. Security notes
6. Edge cases
7. Testing notes
8. Step-by-step implementation plan
```
