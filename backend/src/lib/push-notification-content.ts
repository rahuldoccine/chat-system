import type { MessageKind } from "@prisma/client";

import { getPrisma } from "./prisma.js";
import {
  contentMetaRecord,
  e2eeMessagePreviewBody,
  groupActivityPushPreview,
  plainMessagePreviewBody,
  truncatePushText,
} from "./push-notification-content.helpers.js";

/** Shape of `publicMessage()` from chats service (shared with notification router). */
export type NewMessageNotificationPayload = {
  id: string;
  chatId: string;
  senderId: string;
  clientMessageId: string;
  kind: string;
  ciphertext: string | null;
  contentMeta: unknown;
  replyToId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  reactionsSummary?: Array<{ emoji: string; count: number; byMe: boolean }>;
};

const MAX_TITLE_LEN = 64;
const MAX_BODY_LEN = 180;

/** Preview line shown in push notification body. */
export function messagePreviewBody(
  message: Pick<NewMessageNotificationPayload, "kind" | "ciphertext" | "contentMeta">,
  isE2eeDm: boolean,
): string {
  const meta = contentMetaRecord(message.contentMeta);
  const kind = message.kind as MessageKind;
  if (kind === "SYSTEM") {
    const activityPreview = groupActivityPushPreview(meta);
    if (activityPreview) return activityPreview;
  }

  if (isE2eeDm) {
    return e2eeMessagePreviewBody(meta, kind);
  }

  return plainMessagePreviewBody(meta, kind, message.ciphertext);
}

export type PushNotificationCopy = {
  title: string;
  body: string;
};

export async function resolvePushNotificationContent(params: {
  senderId: string;
  chatId: string;
  message: NewMessageNotificationPayload;
}): Promise<PushNotificationCopy> {
  const prisma = getPrisma();
  const [sender, chat] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.senderId },
      select: { displayName: true, email: true },
    }),
    prisma.chat.findUnique({
      where: { id: params.chatId },
      select: { type: true, title: true, e2eeMode: true },
    }),
  ]);

  const senderName = sender?.displayName?.trim() || sender?.email?.trim() || "Someone";
  const isE2ee =
    (chat?.type === "DIRECT" && chat.e2eeMode === "DM_V1") ||
    (chat?.type === "GROUP" && chat.e2eeMode === "GROUP_V1");
  const preview = messagePreviewBody(params.message, isE2ee);

  if (chat?.type === "GROUP") {
    const groupTitle = chat.title?.trim() || "Group";
    return {
      title: truncatePushText(groupTitle, MAX_TITLE_LEN),
      body: truncatePushText(`${senderName}: ${preview}`, MAX_BODY_LEN),
    };
  }

  return {
    title: truncatePushText(senderName, MAX_TITLE_LEN),
    body: truncatePushText(preview, MAX_BODY_LEN),
  };
}
