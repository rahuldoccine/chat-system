import path from "node:path";

import type { UploadedFile } from "@prisma/client";

import { collectChatIdsReferencingStorageKey } from "./upload-cleanup.js";
import { getPrisma } from "./prisma.js";

/** Uploader can read. Any active member of a chat that references this file can read. */
export async function userCanAccessUploadedFile(userId: string, file: UploadedFile): Promise<boolean> {
  if (file.userId === userId) {
    return true;
  }

  const prisma = getPrisma();

  const logoFileName = path.basename(file.storageKey.replace(/\\/g, "/"));

  // Profile photos (uploads without chatId) linked on User.avatarUrl (file name only in DB)
  const profileOwner = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { avatarUrl: logoFileName },
        { avatarUrl: file.storageKey },
        { avatarUrl: { endsWith: logoFileName } },
      ],
    },
    select: { id: true },
  });
  if (profileOwner) {
    return true;
  }

  const groupWithAvatar = await prisma.chat.findFirst({
    where: {
      type: "GROUP",
      OR: [
        { avatarUrl: logoFileName },
        { avatarUrl: file.storageKey },
        { avatarUrl: { endsWith: logoFileName } },
      ],
    },
    select: { id: true, groupVisibility: true },
  });
  if (groupWithAvatar) {
    if (groupWithAvatar.groupVisibility === "PUBLIC") {
      return true;
    }
    const groupMember = await prisma.chatMember.findFirst({
      where: { userId, chatId: groupWithAvatar.id, leftAt: null },
    });
    if (groupMember) return true;
  }
  const chatIds = new Set<string>();
  if (file.chatId) {
    chatIds.add(file.chatId);
  }

  for (const chatId of await collectChatIdsReferencingStorageKey(file.storageKey)) {
    chatIds.add(chatId);
  }

  if (chatIds.size === 0) {
    return false;
  }

  const member = await prisma.chatMember.findFirst({
    where: {
      userId,
      leftAt: null,
      chatId: { in: [...chatIds] },
    },
  });
  return !!member;
}
