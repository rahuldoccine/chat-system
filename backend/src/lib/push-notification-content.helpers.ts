import type { MessageKind } from "@prisma/client";

import { isPlainObject } from "./plain-object.js";

export function truncatePushText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function stripMentionTags(text: string): string {
  return text
    .replaceAll(/(^|\s)@[a-z0-9._-]+/gi, "$1")
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}

export function contentMetaRecord(meta: unknown): Record<string, unknown> | null {
  return isPlainObject(meta) ? meta : null;
}

export function e2eePushPreviewFromMeta(meta: Record<string, unknown> | null): string | null {
  const line = meta?.pushPreview;
  if (typeof line === "string" && line.trim()) {
    const cleaned = stripMentionTags(line.trim());
    return cleaned || "New message";
  }
  return null;
}

export function e2eePushPreviewFromAttachmentRefs(meta: Record<string, unknown> | null): string | null {
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

export function groupActivityPushPreview(meta: Record<string, unknown> | null): string | null {
  const groupActivity = meta?.groupActivity;
  if (!isPlainObject(groupActivity)) {
    return null;
  }
  const activity = groupActivity;
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

export function kindFallbackPreview(kind: MessageKind): string {
  if (kind === "IMAGE") return "Photo";
  if (kind === "FILE") return "File";
  if (kind === "POLL") return "Poll";
  if (kind === "SYSTEM") return "System message";
  return "New message";
}

export function e2eeMessagePreviewBody(
  meta: Record<string, unknown> | null,
  kind: MessageKind,
): string {
  const fromClient = e2eePushPreviewFromMeta(meta);
  if (fromClient) return fromClient;
  const fromRefs = e2eePushPreviewFromAttachmentRefs(meta);
  if (fromRefs) return fromRefs;
  return kindFallbackPreview(kind);
}

export function plainMessagePreviewBody(
  meta: Record<string, unknown> | null,
  kind: MessageKind,
  ciphertext: string | null | undefined,
): string {
  if (meta?.voiceNote === true) {
    return "Voice message";
  }

  const text = ciphertext?.trim();
  if (text) {
    const cleaned = stripMentionTags(text);
    if (cleaned) return cleaned;
  }

  return kindFallbackPreview(kind);
}
