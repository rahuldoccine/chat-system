## E2EE boundary (DIRECT and GROUP chats)

This backend supports **ciphertext-only** storage and transport for **private (DIRECT) chats** when `Chat.e2eeMode = DM_V1`, and for **groups** when `Chat.e2eeMode = GROUP_V1` (sender-key envelopes; opaque key distribution in `GroupSenderKey`).

### Backend is allowed to know
- **Participants and membership**: `chatId`, `senderId`, recipients (via `ChatMember`)
- **Delivery metadata**: timestamps, receipts, retries, idempotency ids
- **Transport metadata**: payload sizes, MIME types, voice duration (if provided), key ids / device ids as opaque strings
- **Encrypted payloads**: `Message.ciphertext` and `Message.contentMeta` (opaque)

### Backend must never know or store
- Any **plaintext** message text
- Any **decrypted** voice note audio
- Any plaintext-derived previews, transcripts, embeddings, or server-side classification of private content
- Any recovery secret capable of unwrapping E2EE keys

### Recovery support (server-blind)
Account verification (email/MFA step-up) may gate access to **wrapped** key backups, but the backend never decrypts:
- `KeyBackup.wrappedPrivateKeyMaterial` is opaque and only usable with client-held recovery material.
- Backup payload **v2** (client-side JSON before wrapping) may include: identity/device/prekey material, sent-plaintext index, and group sender keys. The server stores only the wrapped blob.

### Group sender-key distribution (`group-v1`)
- `GroupSenderKey.distribution` is opaque JSON. Preferred shape: `{ v: 2, self: { key, epoch }, wrapped: { userId: dmCiphertext } }`.
- Legacy `{ key, epoch }` plaintext self rows remain readable by all members for backward compatibility.
- Identity keys cannot be overwritten via `PUT /e2ee/identity` when the fingerprint changes unless the client sends `x-identity-rotate: true`.

### Client envelope (`dm-v1`)
All new DIRECT messages use mandatory `Chat.e2eeMode = DM_V1`. The browser stores:
- `Message.ciphertext`: base64 JSON `{ v, iv, ct, ephemPub, spkId }`
- `Message.contentMeta.e2eeVersion`: `"dm-v1"` (required)
- Optional transport fields: `url`, `voiceNote`, `uploadId` (not plaintext body)

Legacy messages without `e2eeVersion` may still show historical plaintext in `ciphertext` until replaced by new encrypted traffic.

### Policy
- New DIRECT chats are created with `DM_V1`.
- Clients cannot downgrade DIRECT chats to `NONE` via `PATCH /chats/:id/e2ee`.
- In-chat search and server link previews are disabled for `DM_V1` DMs.

