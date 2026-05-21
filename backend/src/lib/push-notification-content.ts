import type { MessageKind } from "@prisma/client";

import { getPrisma } from "./prisma.js";

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

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function contentMetaRecord(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return meta as Record<string, unknown>;
}

/** Preview line shown in push body (plaintext chats only). */
export function messagePreviewBody(
  message: Pick<NewMessageNotificationPayload, "kind" | "ciphertext" | "contentMeta">,
  isE2eeDm: boolean,
): string {
  if (isE2eeDm) {
    return "New message";
  }

  const meta = contentMetaRecord(message.contentMeta);
  if (meta?.voiceNote === true) {
    return "Voice message";
  }

  const text = message.ciphertext?.trim();
  if (text) {
    return text;
  }

  const kind = message.kind as MessageKind;
  if (kind === "IMAGE") return "Photo";
  if (kind === "FILE") return "File";
  if (kind === "POLL") return "Poll";
  if (kind === "SYSTEM") return "System message";
  return "New message";
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
  const isE2eeDm = chat?.type === "DIRECT" && chat.e2eeMode === "DM_V1";
  const preview = messagePreviewBody(params.message, isE2eeDm);

  if (chat?.type === "GROUP") {
    const groupTitle = chat.title?.trim() || "Group";
    return {
      title: truncate(groupTitle, MAX_TITLE_LEN),
      body: truncate(`${senderName}: ${preview}`, MAX_BODY_LEN),
    };
  }

  return {
    title: truncate(senderName, MAX_TITLE_LEN),
    body: truncate(preview, MAX_BODY_LEN),
  };
}
