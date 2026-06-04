import { Prisma, type Message, type MessageKind, type Chat } from "@prisma/client";

import { AppError } from "../../errors/index.js";
import { requireActiveMember } from "../../lib/chat-access.js";
import { canModerateMessages } from "../../lib/chat-roles.js";
import { getPrisma } from "../../lib/prisma.js";
import { decodeMessageCursor } from "../../lib/cursor-pagination.js";
import { isPlainObject } from "../../lib/plain-object.js";
import {
  extractFirstHttpUrl,
  getCachedLinkPreview,
  type LinkPreview,
} from "../../lib/link-preview.js";

/** Descending message pagination cursor (newer-first lists). */
export function buildDescMessageCursorWhere(
  cursor: string | undefined,
): Prisma.MessageWhereInput {
  if (cursor === undefined || cursor.length === 0) return {};
  const { c, i } = decodeMessageCursor(cursor);
  const t = new Date(c);
  return {
    OR: [
      { createdAt: { lt: t } },
      { AND: [{ createdAt: t }, { id: { lt: i } }] },
    ],
  };
}

/** Descending chat-list pagination cursor (member chat.updatedAt). */
export function buildChatListCursorWhere(cursor: string | undefined): Record<string, unknown> {
  if (cursor === undefined || cursor.length === 0) return {};
  const { c, i } = decodeMessageCursor(cursor);
  const t = new Date(c);
  return {
    OR: [
      { chat: { updatedAt: { lt: t } } },
      { AND: [{ chat: { updatedAt: t } }, { chat: { id: { lt: i } } }] },
    ],
  };
}

/** Ascending thread reply pagination cursor. */
export function buildAscThreadCursorWhere(
  cursor: string | undefined,
): Prisma.MessageWhereInput {
  if (cursor === undefined || cursor.length === 0) return {};
  const { c, i } = decodeMessageCursor(cursor);
  const t = new Date(c);
  return {
    OR: [
      { createdAt: { gt: t } },
      { AND: [{ createdAt: t }, { id: { gt: i } }] },
    ],
  };
}

/** Raw SQL cursor fragment for in-chat message search. */
export function buildSearchMessageCursorFilter(cursor: string | undefined): ReturnType<typeof Prisma.sql> {
  if (cursor === undefined || cursor.length === 0) return Prisma.empty;
  const { c, i } = decodeMessageCursor(cursor);
  const t = new Date(c);
  return Prisma.sql`AND (
    m."createdAt" < ${t}
    OR (m."createdAt" = ${t} AND m.id < ${i})
  )`;
}

export function contentMetaToPrismaInput(
  contentMeta: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (contentMeta === undefined) return undefined;
  if (contentMeta === null) return Prisma.JsonNull;
  return contentMeta as Prisma.InputJsonValue;
}

export function mergeLinkPreviewIntoMeta(
  contentMeta: Record<string, unknown> | null | undefined,
  preview: LinkPreview,
): Record<string, unknown> {
  const existingPreview =
    contentMeta?.preview && isPlainObject(contentMeta.preview)
      ? contentMeta.preview
      : null;
  const displayAs =
    typeof existingPreview?.displayAs === "string" ? existingPreview.displayAs : "inline";
  return {
    ...contentMeta,
    preview: { ...preview, displayAs },
  };
}

export function buildE2eePollContentMeta(
  inputMeta: Record<string, unknown> | null | undefined,
  pollId: string,
  optionRows: Array<{ id: string; sortOrder: number }>,
): Prisma.InputJsonValue {
  return {
    ...inputMeta,
    pollId,
    pollRefs: {
      options: optionRows.map((o) => ({ id: o.id, sortOrder: o.sortOrder })),
    },
  } as Prisma.InputJsonValue;
}

export function isE2eeContentMeta(meta: unknown): boolean {
  if (!isPlainObject(meta)) return false;
  const v = meta.e2eeVersion;
  return typeof v === "string" && v.length > 0;
}

/** Escape user search terms for SQL ILIKE patterns. */
export function escapeIlikePattern(term: string): string {
  return term
    .replaceAll("\\", String.raw`\\`)
    .replaceAll("%", String.raw`\%`)
    .replaceAll("_", String.raw`\_`);
}

export function buildMessagePatchUpdateData(data: {
  ciphertext?: string | null;
  contentMeta?: Record<string, unknown> | null;
}): Prisma.MessageUpdateInput {
  return {
    editedAt: new Date(),
    ...(data.ciphertext === undefined ? {} : { ciphertext: data.ciphertext }),
    ...(data.contentMeta === undefined
      ? {}
      : {
          contentMeta:
            data.contentMeta === null
              ? Prisma.JsonNull
              : (data.contentMeta as Prisma.InputJsonValue),
        }),
  };
}

export function assertE2eeMessageInput(
  chat: Pick<Chat, "type" | "e2eeMode">,
  isE2ee: boolean,
  ciphertext: string | null | undefined,
  contentMeta: Record<string, unknown> | null = null,
): void {
  if (!isE2ee) return;
  const ct = ciphertext ?? null;
  if (!ct || ct.length < 1) {
    throw new AppError(400, "E2EE_REQUIRED", "This chat requires ciphertext-only messages");
  }
  if (!isPlainObject(contentMeta)) {
    throw new AppError(400, "E2EE_META_REQUIRED", "This chat requires E2EE contentMeta");
  }
  const v = contentMeta.e2eeVersion;
  if (typeof v !== "string" || v.length < 1) {
    throw new AppError(400, "E2EE_META_INVALID", "contentMeta.e2eeVersion is required for E2EE chats");
  }
  const { isE2eeGroup } = resolveChatE2eeFlags(chat);
  if (isE2eeGroup) {
    assertGroupDmE2eeMeta(contentMeta);
  }
}

export function assertE2eePatchPayload(data: {
  ciphertext?: string | null;
  contentMeta?: Record<string, unknown> | null;
}): void {
  if (data.ciphertext !== undefined) {
    const ct = data.ciphertext ?? null;
    if (!ct || ct.length < 1) {
      throw new AppError(400, "E2EE_REQUIRED", "This chat requires ciphertext-only messages");
    }
  }
  if (data.contentMeta !== undefined) {
    const meta = data.contentMeta ?? null;
    if (!isPlainObject(meta)) {
      throw new AppError(400, "E2EE_META_REQUIRED", "This chat requires E2EE contentMeta");
    }
    const v = meta.e2eeVersion;
    if (typeof v !== "string" || v.length < 1) {
      throw new AppError(400, "E2EE_META_INVALID", "contentMeta.e2eeVersion is required for E2EE DMs");
    }
  }
}

export function enrichTextMessageContentMeta(params: {
  kind: MessageKind;
  isE2ee: boolean;
  linkPreviewEnabled: boolean;
  textBody: string;
  contentMeta: Record<string, unknown> | null | undefined;
}): {
  contentMeta: Record<string, unknown> | null | undefined;
  schedulePreviewEnrichment: boolean;
} {
  let contentMeta = params.contentMeta;
  const clientHasPreview = isPlainObject(contentMeta) && contentMeta.preview != null;
  let schedulePreviewEnrichment = false;

  if (
    params.kind !== "TEXT" ||
    params.isE2ee ||
    !params.linkPreviewEnabled ||
    params.textBody.length === 0 ||
    clientHasPreview
  ) {
    return { contentMeta, schedulePreviewEnrichment };
  }

  const url = extractFirstHttpUrl(params.textBody);
  if (!url) {
    return { contentMeta, schedulePreviewEnrichment };
  }

  const cached = getCachedLinkPreview(url);
  if (cached) {
    contentMeta = mergeLinkPreviewIntoMeta(contentMeta, cached);
  } else {
    schedulePreviewEnrichment = true;
  }

  return { contentMeta, schedulePreviewEnrichment };
}

/** Prisma include for chats with active members and user profiles. */
export const chatWithActiveMembersUserInclude = {
  members: { where: { leftAt: null }, include: { user: true } },
} as const;

export async function requireLiveMessage(
  prisma: ReturnType<typeof getPrisma>,
  messageId: string,
): Promise<Message> {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.deletedAt) {
    throw new AppError(404, "NOT_FOUND", "Message not found");
  }
  return msg;
}

export async function requireMessageInChat(
  userId: string,
  messageId: string,
): Promise<{ prisma: ReturnType<typeof getPrisma>; msg: Message }> {
  const prisma = getPrisma();
  const msg = await requireLiveMessage(prisma, messageId);
  await requireActiveMember(userId, msg.chatId);
  return { prisma, msg };
}

/** Like requireMessageInChat but allows deleted messages (e.g. reaction cleanup). */
export async function requireExistingMessageInChat(
  userId: string,
  messageId: string,
): Promise<{ prisma: ReturnType<typeof getPrisma>; msg: Message }> {
  const prisma = getPrisma();
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) {
    throw new AppError(404, "NOT_FOUND", "Message not found");
  }
  await requireActiveMember(userId, msg.chatId);
  return { prisma, msg };
}

export async function requireMessageModifyAccess(
  userId: string,
  messageId: string,
  forbiddenMessage: string,
): Promise<{ prisma: ReturnType<typeof getPrisma>; msg: Message }> {
  const prisma = getPrisma();
  const msg = await requireLiveMessage(prisma, messageId);
  const member = await requireActiveMember(userId, msg.chatId);
  const isSender = msg.senderId === userId;
  if (!isSender && !canModerateMessages(member.role)) {
    throw new AppError(403, "FORBIDDEN", forbiddenMessage);
  }
  return { prisma, msg };
}

type MessageWithChatType = Message & { chat: { type: string } };

export async function requirePinMessageAccess(
  userId: string,
  messageId: string,
  opts: { rejectDeleted: boolean },
): Promise<{ prisma: ReturnType<typeof getPrisma>; msg: MessageWithChatType }> {
  const prisma = getPrisma();
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { chat: { select: { type: true } } },
  });
  if (!msg) {
    throw new AppError(404, "NOT_FOUND", "Message not found");
  }
  if (opts.rejectDeleted && msg.deletedAt) {
    throw new AppError(404, "NOT_FOUND", "Message not found");
  }
  const member = await requireActiveMember(userId, msg.chatId);
  if (msg.chat.type === "GROUP" && !canModerateMessages(member.role)) {
    const verb = opts.rejectDeleted ? "pin" : "unpin";
    throw new AppError(403, "FORBIDDEN", `Only moderators can ${verb} messages in groups`);
  }
  return { prisma, msg };
}

export function resolveChatE2eeFlags(chat: Pick<Chat, "type" | "e2eeMode">): {
  isE2eeDm: boolean;
  isE2eeGroup: boolean;
  /** @deprecated Legacy sender-key groups (read-only). */
  isE2eeGroupLegacy: boolean;
  isE2ee: boolean;
} {
  const isE2eeDm = chat.type === "DIRECT" && chat.e2eeMode === "DM_V1";
  const isE2eeGroup = chat.type === "GROUP" && chat.e2eeMode === "DM_V1";
  const isE2eeGroupLegacy = chat.type === "GROUP" && chat.e2eeMode === "GROUP_V1";
  return {
    isE2eeDm,
    isE2eeGroup,
    isE2eeGroupLegacy,
    isE2ee: isE2eeDm || isE2eeGroup || isE2eeGroupLegacy,
  };
}

const MAX_GROUP_RECIPIENT_CIPHERTEXTS = 64;

function assertGroupDmE2eeMeta(contentMeta: Record<string, unknown>): void {
  if (contentMeta.e2eeVersion !== "dm-v1") {
    throw new AppError(
      400,
      "E2EE_META_INVALID",
      "Group E2EE messages must use e2eeVersion dm-v1",
    );
  }
  const wrapped = contentMeta.recipientCiphertexts;
  if (!isPlainObject(wrapped)) {
    throw new AppError(
      400,
      "E2EE_META_INVALID",
      "contentMeta.recipientCiphertexts is required for encrypted groups",
    );
  }
  let count = 0;
  for (const value of Object.values(wrapped)) {
    if (typeof value === "string" && value.length > 0) count += 1;
  }
  if (count < 1) {
    throw new AppError(
      400,
      "E2EE_META_INVALID",
      "recipientCiphertexts must include at least one envelope",
    );
  }
  if (count > MAX_GROUP_RECIPIENT_CIPHERTEXTS) {
    throw new AppError(400, "E2EE_META_INVALID", "recipientCiphertexts exceeds member limit");
  }
}

/** Create delivery receipts for other members and bump chat last activity. */
export async function touchChatAfterOutboundMessage(
  tx: Prisma.TransactionClient,
  chatId: string,
  senderId: string,
  messageId: string,
  createdAt: Date,
): Promise<void> {
  const members = await tx.chatMember.findMany({ where: { chatId, leftAt: null } });
  const receipts = members
    .filter((m) => m.userId !== senderId)
    .map((m) => ({ messageId, userId: m.userId }));
  if (receipts.length) {
    await tx.receipt.createMany({ data: receipts });
  }
  await tx.chat.update({
    where: { id: chatId },
    data: { lastMessageAt: createdAt, updatedAt: new Date() },
  });
}

export function buildGroupChatPatchData(data: {
  title?: string;
  avatarUrl?: string | null;
  groupVisibility?: "PRIVATE" | "PUBLIC";
}): Prisma.ChatUpdateInput {
  return {
    ...(data.title === undefined ? {} : { title: data.title }),
    ...(data.avatarUrl === undefined
      ? {}
      : { avatarUrl: data.avatarUrl }),
    ...(data.groupVisibility === undefined ? {} : { groupVisibility: data.groupVisibility }),
  };
}
