import type { ChatMemberRole } from "@prisma/client";
import { AppError } from "../../errors/index.js";
import { roleAtLeast } from "../chat-roles.js";
import { getPrisma } from "../prisma.js";

export type MentionsMeta = {
  userIds: string[];
  all?: boolean;
};

export async function validateAndMergeMentions(
  userId: string,
  chatId: string,
  senderRole: ChatMemberRole,
  contentMeta: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown> | null | undefined> {
  if (!contentMeta || typeof contentMeta !== "object") {
    return contentMeta;
  }
  const raw = (contentMeta as { mentions?: unknown }).mentions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return contentMeta;
  }
  const m = raw as { userIds?: unknown; all?: unknown };
  const userIds = Array.isArray(m.userIds)
    ? [...new Set(m.userIds.filter((id): id is string => typeof id === "string"))]
    : [];
  const all = m.all === true;
  if (userIds.length === 0 && !all) {
    const nextMeta = { ...contentMeta };
    delete (nextMeta as { mentions?: unknown }).mentions;
    return nextMeta;
  }
  const prisma = getPrisma();
  const members = await prisma.chatMember.findMany({
    where: { chatId, leftAt: null },
    select: { userId: true },
  });
  const memberSet = new Set(members.map((x) => x.userId));
  if (all) {
    if (!roleAtLeast(senderRole, "ADMIN")) {
      throw new AppError(403, "FORBIDDEN", "@all is only allowed for admins");
    }
  }
  const validIds = userIds.filter((id) => id !== userId && memberSet.has(id));
  const next: MentionsMeta = { userIds: validIds };
  if (all) next.all = true;
  return { ...contentMeta, mentions: next };
}

export function isUserMentioned(
  userId: string,
  contentMeta: unknown,
): boolean {
  if (!contentMeta || typeof contentMeta !== "object") return false;
  const mentions = (contentMeta as { mentions?: MentionsMeta }).mentions;
  if (!mentions) return false;
  if (mentions.all) return true;
  return Array.isArray(mentions.userIds) && mentions.userIds.includes(userId);
}
