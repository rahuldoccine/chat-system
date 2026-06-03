import { randomUUID } from "node:crypto";
import { getPrisma } from "../prisma.js";
import { publicMessage } from "../../modules/chats/chats.service.js";
import { createSystemMessageWithReceipts } from "../system-message-persist.js";
import { notifyNewMessage } from "../notification-router.js";
import { getSocketIo } from "../../sockets/socket-holder.js";
import { emitMessageNewToMembers } from "../../sockets/message-broadcast.js";
import { SOCKET_PROTOCOL_VERSION } from "../../sockets/constants.js";

export type GroupActivityType =
  | "group_created"
  | "member_joined"
  | "member_left"
  | "member_removed"
  | "role_changed"
  | "title_changed"
  | "avatar_changed"
  | "group_call_started"
  | "group_call_ended";

export type GroupActivityMeta = {
  type: GroupActivityType;
  actorId: string;
  actorName?: string;
  kind?: "AUDIO" | "VIDEO";
  targetUserId?: string;
  targetName?: string;
  newRole?: string;
  title?: string;
};

function formatActivityText(meta: GroupActivityMeta): string {
  const actor = meta.actorName ?? "Someone";
  const target = meta.targetName ?? "a member";
  switch (meta.type) {
    case "group_created":
      return `${actor} created the group`;
    case "member_joined":
      return meta.actorId === meta.targetUserId
        ? `${actor} joined`
        : `${actor} added ${target}`;
    case "member_left":
      return `${actor} left the group`;
    case "member_removed":
      return `${actor} removed ${target}`;
    case "role_changed":
      return `${target} is now ${meta.newRole ?? "a member"}`;
    case "title_changed":
      return `${actor} renamed the group to "${meta.title ?? "Untitled"}"`;
    case "avatar_changed":
      return `${actor} updated the group photo`;
    case "group_call_started":
      return `${actor} started a group call`;
    case "group_call_ended":
      return `${actor} ended the group call`;
    default:
      return "Group updated";
  }
}

export async function publishGroupActivityMessage(input: {
  chatId: string;
  senderId: string;
  meta: GroupActivityMeta;
  clientMessageId?: string;
}): Promise<ReturnType<typeof publicMessage> | null> {
  const ciphertext = formatActivityText(input.meta);
  const contentMeta = { groupActivity: input.meta };
  const clientMessageId =
    input.clientMessageId ??
    `grp-${input.meta.type}-${Date.now()}-${randomUUID()}`;

  const message = await createSystemMessageWithReceipts({
    chatId: input.chatId,
    senderId: input.senderId,
    clientMessageId,
    ciphertext,
    contentMeta,
  });

  const published = publicMessage(message, [], "sent", null);
  const io = getSocketIo();
  if (io) {
    await emitMessageNewToMembers(io, input.chatId, {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: input.chatId,
      message: published,
    });
  }
  void notifyNewMessage({ senderId: input.senderId, chatId: input.chatId, message: published }).catch(
    () => {},
  );
  return published;
}

export async function resolveDisplayName(userId: string): Promise<string> {
  const prisma = getPrisma();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, email: true, username: true },
  });
  if (!u) return "Someone";
  return u.displayName || u.username || u.email.split("@")[0] || "Someone";
}
