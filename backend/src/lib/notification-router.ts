import { loadConfig } from "../config/index.js";
import { getOrCreateSettings } from "../modules/users/users.service.js";
import { isActivelyViewingChatLocally } from "../sockets/notification-context-memory.js";

import { isActivelyViewingChatRedis } from "./notification-context-redis.js";
import {
  resolvePushNotificationContent,
  type NewMessageNotificationPayload,
} from "./push-notification-content.js";
import { shouldSendPush } from "./notification-policy.js";
import { enqueuePushNotification } from "./push-queue.js";
import { getPrisma } from "./prisma.js";

export type { NewMessageNotificationPayload };

async function isRecipientActivelyViewingChat(userId: string, chatId: string): Promise<boolean> {
  const config = loadConfig();
  const fromRedis = await isActivelyViewingChatRedis(userId, chatId, config);
  if (fromRedis !== null) {
    return fromRedis;
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

  for (const m of members) {
    const settings = m.user.userSettings ?? (await getOrCreateSettings(m.userId));
    const viewing = await isRecipientActivelyViewingChat(m.userId, payload.chatId);
    const send = shouldSendPush({
      notifyPush: settings.notifyPush,
      mutedUntil: m.mutedUntil,
      isActivelyViewingChat: viewing,
    });
    if (send) {
      enqueuePushNotification({
        userId: m.userId,
        chatId: payload.chatId,
        messageId: payload.message.id,
        title: pushCopy.title,
        body: pushCopy.body,
      });
    }
  }
}
