import type { ChatMember, ChatMemberRole } from "@prisma/client";

import { AppError } from "../errors/index.js";
import { roleAtLeast } from "./chat-roles.js";
import { getPrisma } from "./prisma.js";

export async function requireActiveMember(
  userId: string,
  chatId: string,
): Promise<ChatMember & { role: ChatMemberRole }> {
  const prisma = getPrisma();
  const m = await prisma.chatMember.findFirst({
    where: { userId, chatId, leftAt: null },
  });
  if (!m) {
    throw new AppError(403, "NOT_MEMBER", "You are not a member of this chat");
  }
  return m as ChatMember & { role: ChatMemberRole };
}

export async function requireActiveMemberMinRole(
  userId: string,
  chatId: string,
  minRole: ChatMemberRole,
): Promise<ChatMember & { role: ChatMemberRole }> {
  const m = await requireActiveMember(userId, chatId);
  if (!roleAtLeast(m.role, minRole)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions for this chat");
  }
  return m;
}
