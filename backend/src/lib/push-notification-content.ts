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

function stripMentionTags(text: string): string {
  // Remove tokens like @all and @username from push preview copy.
  return text
    .replace(/(^|\s)@[a-z0-9._-]+/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function contentMetaRecord(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return meta as Record<string, unknown>;
}

function e2eePushPreviewFromMeta(meta: Record<string, unknown> | null): string | null {
  const line = meta?.pushPreview;
  if (typeof line === "string" && line.trim()) {
    const cleaned = stripMentionTags(line.trim());
    return cleaned || "New message";
  }
  return null;
}

function e2eePushPreviewFromAttachmentRefs(meta: Record<string, unknown> | null): string | null {
  const refs = meta?.attachmentRefs;
  if (!refs || typeof refs !== "object" || Array.isArray(refs)) return null;
  const files = (refs as { files?: unknown }).files;
  if (!Array.isArray(files) || files.length === 0) return null;
  if (files.length === 1) {
    const f = files[0];
    if (f && typeof f === "object") {
      const name = (f as { filename?: string }).filename?.trim();
      if (name) return name;
    }
    return "File";
  }
  return `Sent ${files.length} files`;
}

function groupActivityPushPreview(meta: Record<string, unknown> | null): string | null {
  const groupActivity = meta?.groupActivity;
  if (!groupActivity || typeof groupActivity !== "object" || Array.isArray(groupActivity)) {
    return null;
  }
  const activity = groupActivity as Record<string, unknown>;
  const type = activity.type;
  if (type !== "member_joined") {
    return null;
  }
  const actorName =
    typeof activity.actorName === "string" && activity.actorName.trim().length > 0
      ? activity.actorName.trim()
      : "Someone";
  const targetName =
    typeof activity.targetName === "string" && activity.targetName.trim().length > 0
      ? activity.targetName.trim()
      : "a member";
  const actorId = typeof activity.actorId === "string" ? activity.actorId : "";
  const targetUserId = typeof activity.targetUserId === "string" ? activity.targetUserId : "";

  if (actorId && targetUserId && actorId === targetUserId) {
    return `${actorName} joined the public group`;
  }
  return `${actorName} added ${targetName} to the group`;
}

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
    const fromClient = e2eePushPreviewFromMeta(meta);
    if (fromClient) return fromClient;
    const fromRefs = e2eePushPreviewFromAttachmentRefs(meta);
    if (fromRefs) return fromRefs;
    if (kind === "IMAGE") return "Photo";
    if (kind === "FILE") return "File";
    if (kind === "POLL") return "Poll";
    return "New message";
  }

  if (meta?.voiceNote === true) {
    return "Voice message";
  }

  const text = message.ciphertext?.trim();
  if (text) {
    const cleaned = stripMentionTags(text);
    if (cleaned) return cleaned;
  }

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
  const isE2ee =
    (chat?.type === "DIRECT" && chat.e2eeMode === "DM_V1") ||
    (chat?.type === "GROUP" && chat.e2eeMode === "GROUP_V1");
  const preview = messagePreviewBody(params.message, isE2ee);

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
