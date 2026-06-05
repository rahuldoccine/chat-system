import type { ChatMemberRole } from "@prisma/client";
import { AppError } from "../../errors/index.js";
import { expandAvatarUrl } from "../avatar-urls.js";
import { getPrisma } from "../prisma.js";
import { requireActiveMember } from "../chat-access.js";

export type GroupMemberPublic = {
  userId: string;
  role: ChatMemberRole;
  joinedAt: string;
  displayName: string | null;
  email: string;
  username: string | null;
  avatarUrl: string | null;
};

export type GroupChatDetails = {
  id: string;
  title: string | null;
  avatarUrl: string | null;
  groupVisibility: "PRIVATE" | "PUBLIC";
  memberCount: number;
  myRole: ChatMemberRole;
  members: GroupMemberPublic[];
};

export async function getGroupChatDetails(
  userId: string,
  chatId: string,
): Promise<GroupChatDetails> {
  const me = await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ role: "desc" }, { joinedAt: "asc" }],
      },
    },
  });
  if (chat?.type !== "GROUP") {
    throw new AppError(404, "NOT_FOUND", "Group not found");
  }
  const members: GroupMemberPublic[] = chat.members.map((m) => ({
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    displayName: m.user.displayName,
    email: m.user.email,
    username: m.user.username,
    avatarUrl: expandAvatarUrl(m.user.avatarUrl),
  }));
  return {
    id: chat.id,
    title: chat.title,
    avatarUrl: expandAvatarUrl(chat.avatarUrl),
    groupVisibility: chat.groupVisibility,
    memberCount: members.length,
    myRole: me.role,
    members,
  };
}
