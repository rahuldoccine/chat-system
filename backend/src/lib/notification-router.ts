import { loadConfig } from "../config/index.js";
import { getOrCreateSettings } from "../modules/users/users.service.js";
import { isActivelyViewingChatLocally } from "../sockets/notification-context-memory.js";

import {
  isActivelyViewingChatRedis,
  notificationContextExistsInRedis,
} from "./notification-context-redis.js";
import {
  resolvePushNotificationContent,
  type NewMessageNotificationPayload,
} from "./push-notification-content.js";
import { shouldSendPush } from "./notification-policy.js";
import { enqueuePushNotification } from "./push-queue.js";
import { getPrisma } from "./prisma.js";

export type { NewMessageNotificationPayload };

type MentionsMeta = { userIds?: string[]; all?: boolean };

function readMentionsMeta(contentMeta: unknown): MentionsMeta {
  if (!contentMeta || typeof contentMeta !== "object" || Array.isArray(contentMeta)) {
    return {};
  }
  const raw = (contentMeta as { mentions?: unknown }).mentions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const m = raw as MentionsMeta;
  return {
    userIds: Array.isArray(m.userIds) ? m.userIds.filter((id): id is string => typeof id === "string") : [],
    all: m.all === true,
  };
}

async function isRecipientActivelyViewingChat(userId: string, chatId: string): Promise<boolean> {
  const config = loadConfig();
  const fromRedis = await isActivelyViewingChatRedis(userId, chatId, config);
  if (fromRedis !== null) {
    return fromRedis;
  }
  const ctxExists = await notificationContextExistsInRedis(userId, config);
  // Redis is up but context expired → do not use stale in-memory suppression.
  if (ctxExists === false) {
    return false;
  }
  return isActivelyViewingChatLocally(userId, chatId);
}

/** Fire-and-forget notification routing after a message is persisted (non-idempotent create only). */
export async function notifyNewMessage(payload: {
  senderId: string;
  chatId: string;
  message: NewMessageNotificationPayload;
}): Promise<void> {
  const prisma = getPrisma();
  const members = await prisma.chatMember.findMany({
    where: { chatId: payload.chatId, leftAt: null, userId: { not: payload.senderId } },
    include: { user: { include: { userSettings: true } } },
  });

  const pushCopy = await resolvePushNotificationContent({
    senderId: payload.senderId,
    chatId: payload.chatId,
    message: payload.message,
  });
  const mentions = readMentionsMeta(payload.message.contentMeta);
  const hasDirectMentions = Boolean(mentions.all || (mentions.userIds?.length ?? 0) > 0);
  const mentionedSet = new Set(mentions.userIds ?? []);

  for (const m of members) {
    const isMentionRecipient = mentions.all === true || mentionedSet.has(m.userId);
    const shouldTargetRecipient = hasDirectMentions ? isMentionRecipient : true;
    if (!shouldTargetRecipient) continue;

    const settings = m.user.userSettings ?? (await getOrCreateSettings(m.userId));
    const viewing = await isRecipientActivelyViewingChat(m.userId, payload.chatId);
    const baseSend = shouldSendPush({
      notifyPush: settings.notifyPush,
      mutedUntil: m.mutedUntil,
      isActivelyViewingChat: viewing,
    });
    const muted = Boolean(m.mutedUntil && m.mutedUntil > new Date());
    // Mentions bypass only "actively viewing this chat" suppression.
    // They still respect notifyPush + mute settings.
    const send = baseSend || (isMentionRecipient && settings.notifyPush && !muted);
    if (send) {
      enqueuePushNotification({
        userId: m.userId,
        chatId: payload.chatId,
        messageId: payload.message.id,
        title: isMentionRecipient ? `${pushCopy.title}` : pushCopy.title,
        body: pushCopy.body,
      });
    }
  }
}
