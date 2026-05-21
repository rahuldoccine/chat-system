import type { UploadedFile } from "@prisma/client";

import { collectChatIdsReferencingStorageKey } from "./upload-cleanup.js";
import { getPrisma } from "./prisma.js";

/** Uploader can read. Any active member of a chat that references this file can read. */
export async function userCanAccessUploadedFile(userId: string, file: UploadedFile): Promise<boolean> {
  if (file.userId === userId) {
    return true;
  }

  const prisma = getPrisma();

  // Profile photos (uploads without chatId) linked on User.avatarUrl
  const profileOwner = await prisma.user.findFirst({
    where: {
      avatarUrl: { contains: file.storageKey },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (profileOwner) {
    return true;
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
