import fs from "node:fs/promises";

import { Prisma, type MessageKind } from "@prisma/client";

import { isPlainObject } from "./plain-object.js";
import { getPrisma } from "./prisma.js";
import { resolveLogoStorageKey } from "./avatar-urls.js";
import {
  isSafeStorageKey,
  resolveStorageAbsolutePath,
  storageKeyFromUrl,
} from "./upload-storage.js";

export type UploadFileRefs = {
  storageKeys: string[];
  uploadIds: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

export { storageKeyFromUrl } from "./upload-storage.js";

function addFileRef(target: UploadFileRefs, file: unknown): void {
  const rec = asRecord(file);
  if (!rec) return;

  if (typeof rec.filename === "string" && rec.filename.trim()) {
    target.storageKeys.push(rec.filename.trim());
  }
  if (typeof rec.key === "string" && rec.key.trim()) {
    target.storageKeys.push(rec.key.trim());
  }
  const fromUrl = storageKeyFromUrl(rec.url);
  if (fromUrl) target.storageKeys.push(fromUrl);
  if (typeof rec.uploadId === "string" && rec.uploadId.trim()) {
    target.uploadIds.push(rec.uploadId.trim());
  }
}

/** Extract storage keys and upload row ids from message contentMeta (single, bundled, or E2EE attachmentRefs). */
export function extractUploadRefsFromContentMeta(contentMeta: unknown): UploadFileRefs {
  const refs: UploadFileRefs = { storageKeys: [], uploadIds: [] };
  const meta = asRecord(contentMeta);
  if (!meta) return refs;

  addFileRef(refs, meta);

  const attachmentRefs = asRecord(meta.attachmentRefs);
  if (attachmentRefs) {
    if (Array.isArray(attachmentRefs.files)) {
      for (const entry of attachmentRefs.files) addFileRef(refs, entry);
    }
    addFileRef(refs, attachmentRefs);
  }

  if (Array.isArray(meta.files)) {
    for (const entry of meta.files) addFileRef(refs, entry);
  }

  refs.storageKeys = [...new Set(refs.storageKeys)];
  refs.uploadIds = [...new Set(refs.uploadIds)];
  return refs;
}

export { isSafeStorageKey } from "./upload-storage.js";

function mediaMessageKinds(): MessageKind[] {
  return ["IMAGE", "FILE"];
}

/** Chats with a non-deleted message referencing this storage key (single or bundled files). */
export async function collectChatIdsReferencingStorageKey(storageKey: string): Promise<string[]> {
  if (!isSafeStorageKey(storageKey)) return [];

  const prisma = getPrisma();
  const pattern = `%${storageKey}%`;
  const rows = await prisma.$queryRaw<Array<{ chatId: string; contentMeta: unknown }>>`
    SELECT "chatId", "contentMeta"
    FROM "Message"
    WHERE "deletedAt" IS NULL
      AND "contentMeta" IS NOT NULL
      AND (
        "contentMeta"->>'filename' = ${storageKey}
        OR COALESCE("contentMeta"->>'url', '') LIKE ${pattern}
        OR "contentMeta"::text LIKE ${pattern}
      )
  `;

  const chatIds = new Set<string>();
  for (const row of rows) {
    if (extractUploadRefsFromContentMeta(row.contentMeta).storageKeys.includes(storageKey)) {
      chatIds.add(row.chatId);
    }
  }
  return [...chatIds];
}

/** True if another non-deleted message still references this storage key. */
export async function isStorageKeyReferencedByActiveMessages(
  storageKey: string,
  excludeMessageId?: string,
): Promise<boolean> {
  const prisma = getPrisma();
  const rows = await prisma.message.findMany({
    where: {
      ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
      deletedAt: null,
      kind: { in: mediaMessageKinds() },
      contentMeta: { not: Prisma.DbNull },
    },
    select: { contentMeta: true },
  });

  return rows.some((row) => extractUploadRefsFromContentMeta(row.contentMeta).storageKeys.includes(storageKey));
}

export async function unlinkStorageFile(uploadDir: string, storageKey: string): Promise<void> {
  const abs = resolveStorageAbsolutePath(uploadDir, storageKey);
  if (!abs) return;
  await fs.unlink(abs).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
}

/** Remove UploadedFile row and delete file from disk. */
export async function hardDeleteUploadedFileByStorageKey(
  uploadDir: string,
  storageKey: string,
): Promise<void> {
  if (!isSafeStorageKey(storageKey)) return;

  const prisma = getPrisma();
  const record = await prisma.uploadedFile.findUnique({ where: { storageKey } });
  await unlinkStorageFile(uploadDir, storageKey);
  if (record) {
    await prisma.uploadedFile.delete({ where: { id: record.id } }).catch(() => {});
  }
}

/**
 * Delete a previous profile avatar file when the user uploads a new one or removes their photo.
 * Only removes self-hosted files (/api/v1/files/{key}); skips external URLs.
 */
export async function deleteReplacedAvatarUpload(
  uploadDir: string,
  previousAvatarUrl: string | null | undefined,
  nextAvatarUrl: string | null | undefined,
): Promise<void> {
  if (!previousAvatarUrl || previousAvatarUrl === nextAvatarUrl) return;

  const storageKey =
    resolveLogoStorageKey(previousAvatarUrl) ?? storageKeyFromUrl(previousAvatarUrl);
  if (!storageKey || !isSafeStorageKey(storageKey)) return;

  const stillInMessages = await isStorageKeyReferencedByActiveMessages(storageKey);
  if (stillInMessages) return;

  await hardDeleteUploadedFileByStorageKey(uploadDir, storageKey);
}

async function resolveStorageKeysFromUploadIds(uploadIds: string[]): Promise<string[]> {
  if (!uploadIds.length) return [];
  const prisma = getPrisma();
  const rows = await prisma.uploadedFile.findMany({
    where: { id: { in: uploadIds } },
    select: { storageKey: true },
  });
  return rows.map((r) => r.storageKey).filter((k) => isSafeStorageKey(k));
}

async function collectStorageKeysForMessage(
  _uploadDir: string,
  contentMeta: unknown,
  messageId: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const refs = extractUploadRefsFromContentMeta(contentMeta);
  for (const k of refs.storageKeys) keys.add(k);

  for (const k of await resolveStorageKeysFromUploadIds(refs.uploadIds)) {
    keys.add(k);
  }

  const prisma = getPrisma();
  const bound = await prisma.uploadedFile.findMany({
    where: { messageId },
    select: { storageKey: true },
  });
  for (const row of bound) {
    if (isSafeStorageKey(row.storageKey)) keys.add(row.storageKey);
  }

  return keys;
}

/**
 * Associate uploaded files with a message row (for purge when contentMeta lacks file manifest, e.g. legacy E2EE).
 */
export async function bindUploadsToMessage(
  messageId: string,
  chatId: string,
  contentMeta: unknown,
): Promise<void> {
  const refs = extractUploadRefsFromContentMeta(contentMeta);
  if (!refs.uploadIds.length) return;

  const prisma = getPrisma();
  await prisma.uploadedFile.updateMany({
    where: {
      id: { in: refs.uploadIds },
      OR: [{ chatId: null }, { chatId }],
    },
    data: {
      messageId,
      chatId,
    },
  });
}

/**
 * Permanently remove uploads referenced by a message when no other active message uses them.
 * Call after the message is marked deleted.
 */
export async function purgeUploadsForMessage(
  uploadDir: string,
  contentMeta: unknown,
  messageId: string,
): Promise<void> {
  const keys = await collectStorageKeysForMessage(uploadDir, contentMeta, messageId);

  for (const storageKey of keys) {
    const stillUsed = await isStorageKeyReferencedByActiveMessages(storageKey, messageId);
    if (stillUsed) continue;
    await hardDeleteUploadedFileByStorageKey(uploadDir, storageKey);
  }

  const prisma = getPrisma();
  await prisma.uploadedFile
    .updateMany({ where: { messageId }, data: { messageId: null } })
    .catch(() => {});
}

/** Permanently remove all uploads scoped to a chat (DB + disk). Use before deleting a chat. */
export async function purgeAllUploadsForChat(uploadDir: string, chatId: string): Promise<void> {
  const prisma = getPrisma();
  const rows = await prisma.uploadedFile.findMany({
    where: { chatId },
    select: { storageKey: true },
  });

  for (const row of rows) {
    await hardDeleteUploadedFileByStorageKey(uploadDir, row.storageKey);
  }

  const messages = await prisma.message.findMany({
    where: { chatId, kind: { in: mediaMessageKinds() }, contentMeta: { not: Prisma.DbNull } },
    select: { contentMeta: true },
  });

  const orphanKeys = new Set<string>();
  for (const m of messages) {
    for (const key of extractUploadRefsFromContentMeta(m.contentMeta).storageKeys) {
      orphanKeys.add(key);
    }
  }

  for (const storageKey of orphanKeys) {
    await hardDeleteUploadedFileByStorageKey(uploadDir, storageKey);
  }
}
