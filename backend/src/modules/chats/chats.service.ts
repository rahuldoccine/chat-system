import { Prisma, type ChatE2eeMode, type ChatType, type MessageKind } from "@prisma/client";

import { AppError } from "../../errors/index.js";
import { requireActiveMember, requireActiveMemberMinRole } from "../../lib/chat-access.js";
import { expandAvatarUrl, normalizeAvatarDbValue } from "../../lib/avatar-urls.js";
import {
  canInviteGroupMembers,
  canManageGroupMeta,
  roleAtLeast,
  roleRank,
} from "../../lib/chat-roles.js";
import { encodeMessageCursor } from "../../lib/cursor-pagination.js";
import { assertNotBlockedPair } from "../../lib/moderation-guard.js";
import { notifyNewMessage } from "../../lib/notification-router.js";
import { getPollForUser } from "../polls/polls.service.js";
import { loadConfig } from "../../config/index.js";
import { isPlainObject } from "../../lib/plain-object.js";
import { getPrisma } from "../../lib/prisma.js";
import { pairKeyForUserIds } from "../../lib/pair-key.js";
import {
  bindUploadsToMessage,
  deleteReplacedAvatarUpload,
  purgeUploadsForMessage,
} from "../../lib/upload-cleanup.js";
import { messageWithSenderInclude, senderSelect } from "../../lib/message-includes.js";
import { fetchLinkPreviewForText } from "../../lib/link-preview.js";
import { isUserMentioned, validateAndMergeMentions } from "../../lib/groups/mentions.js";
import { emitToChatMembers } from "../../sockets/chat-broadcast.js";
import { SOCKET_PROTOCOL_VERSION } from "../../sockets/constants.js";
import { getSocketIo } from "../../sockets/socket-holder.js";
import {
  publishGroupActivityMessage,
  resolveDisplayName,
} from "../../lib/groups/group-system-message.js";
import {
  assertE2eeMessageInput,
  assertE2eePatchPayload,
  buildAscThreadCursorWhere,
  buildChatListCursorWhere,
  buildDescMessageCursorWhere,
  buildE2eePollContentMeta,
  buildGroupChatPatchData,
  buildMessagePatchUpdateData,
  buildSearchMessageCursorFilter,
  chatWithActiveMembersUserInclude,
  contentMetaToPrismaInput,
  enrichTextMessageContentMeta,
  escapeIlikePattern,
  isE2eeContentMeta,
  mergeLinkPreviewIntoMeta,
  requireExistingMessageInChat,
  requireMessageInChat,
  requireMessageModifyAccess,
  requirePinMessageAccess,
  resolveChatE2eeFlags,
  touchChatAfterOutboundMessage,
} from "./chats.helpers.js";

async function isBlockedPair(a: string, b: string): Promise<boolean> {
  try {
    await assertNotBlockedPair(a, b);
    return false;
  } catch (e) {
    if (e instanceof AppError && e.code === "BLOCKED") return true;
    throw e;
  }
}

export type MessageReactionSummary = { emoji: string; count: number; byMe: boolean };
export type { MessageReceiptStatus } from "../../lib/receipt-status.js";
import {
  deriveMessageReceiptStatus,
  type MessageReceiptStatus,
} from "../../lib/receipt-status.js";

/** Matches main chat timeline (excludes thread-only replies). */
const MAIN_FEED_MESSAGE_WHERE = {
  OR: [{ threadRootId: null }, { broadcastToChannel: true }],
} satisfies Prisma.MessageWhereInput;

export type PublicReplyPreview = {
  id: string;
  senderId: string;
  kind: MessageKind;
  ciphertext: string | null;
  contentMeta: unknown;
  sender?: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    username: string | null;
  };
};

export function publicReplyPreview(m: {
  id: string;
  senderId: string;
  kind: MessageKind;
  ciphertext: string | null;
  contentMeta: unknown;
  sender?: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    username: string | null;
  } | null;
}): PublicReplyPreview {
  return {
    id: m.id,
    senderId: m.senderId,
    kind: m.kind,
    ciphertext: m.ciphertext,
    contentMeta: m.contentMeta,
    sender: m.sender
      ? {
          id: m.sender.id,
          email: m.sender.email,
          displayName: m.sender.displayName,
          avatarUrl: expandAvatarUrl(m.sender.avatarUrl),
          username: m.sender.username,
        }
      : undefined,
  };
}

export function publicMessage(
  m: {
    id: string;
    chatId: string;
    senderId: string;
    clientMessageId: string;
    kind: MessageKind;
    ciphertext: string | null;
    contentMeta: unknown;
    replyToId: string | null;
    threadRootId?: string | null;
    broadcastToChannel?: boolean;
    threadReplyCount?: number;
    threadLastReplyAt?: Date | null;
    editedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    sender?: {
      id: string;
      email: string;
      displayName: string | null;
      avatarUrl: string | null;
      username: string | null;
    } | null;
  },
  reactionsSummary?: MessageReactionSummary[],
  receiptStatus?: MessageReceiptStatus,
  replyTo?: PublicReplyPreview | null,
) {
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    clientMessageId: m.clientMessageId,
    kind: m.kind,
    ciphertext: m.ciphertext,
    contentMeta: m.contentMeta,
    replyToId: m.replyToId,
    replyTo: replyTo ?? null,
    threadRootId: m.threadRootId ?? null,
    broadcastToChannel: m.broadcastToChannel ?? false,
    threadReplyCount: m.threadReplyCount ?? 0,
    threadLastReplyAt: m.threadLastReplyAt ?? null,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    createdAt: m.createdAt,
    reactionsSummary: reactionsSummary ?? [],
    receiptStatus,
    sender: m.sender ? {
      id: m.sender.id,
      email: m.sender.email,
      displayName: m.sender.displayName,
      avatarUrl: expandAvatarUrl(m.sender.avatarUrl),
      username: m.sender.username,
    } : undefined,
  };
}

async function resolveCanonicalThreadRoot(
  chatId: string,
  threadRootId: string,
): Promise<string> {
  const prisma = getPrisma();
  const target = await prisma.message.findFirst({
    where: { id: threadRootId, chatId, deletedAt: null },
    select: { id: true, threadRootId: true },
  });
  if (!target) {
    throw new AppError(400, "INVALID_THREAD", "Thread root not in this chat");
  }
  const canonicalRootId = target.threadRootId ?? target.id;
  const root = await prisma.message.findFirst({
    where: { id: canonicalRootId, chatId, deletedAt: null, threadRootId: null },
    select: { id: true },
  });
  if (!root) {
    throw new AppError(400, "INVALID_THREAD", "Thread root is invalid");
  }
  return canonicalRootId;
}

function replyPreviewFromRow(
  row: { replyTo?: Parameters<typeof publicReplyPreview>[0] | null },
): PublicReplyPreview | null {
  return row.replyTo ? publicReplyPreview(row.replyTo) : null;
}

/** Whether this user allows others to see when they have read messages. */
export async function userSharesReadReceipts(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
): Promise<boolean> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { showReadReceipts: true },
  });
  return row?.showReadReceipts ?? true;
}

async function readReceiptSharingByUserIds(
  prisma: ReturnType<typeof getPrisma>,
  userIds: string[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  for (const id of userIds) {
    out.set(id, true);
  }
  if (userIds.length === 0) return out;
  const rows = await prisma.userSettings.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, showReadReceipts: true },
  });
  for (const row of rows) {
    out.set(row.userId, row.showReadReceipts);
  }
  return out;
}

/** For messages sent by `viewerUserId`, derive sent vs read from recipient receipts. */
async function receiptStatusForMessages(
  prisma: ReturnType<typeof getPrisma>,
  messageIds: string[],
  viewerUserId: string,
): Promise<Map<string, MessageReceiptStatus>> {
  const out = new Map<string, MessageReceiptStatus>();
  if (messageIds.length === 0) return out;

  const ownMessages = await prisma.message.findMany({
    where: { id: { in: messageIds }, senderId: viewerUserId },
    select: { id: true },
  });
  if (ownMessages.length === 0) return out;

  const ownIds = ownMessages.map((m) => m.id);
  const receipts = await prisma.receipt.findMany({
    where: { messageId: { in: ownIds }, userId: { not: viewerUserId } },
    select: { messageId: true, userId: true, deliveredAt: true, readAt: true },
  });

  const recipientIds = [...new Set(receipts.map((r) => r.userId))];
  const sharing = await readReceiptSharingByUserIds(prisma, recipientIds);

  const agg = new Map<
    string,
    { deliveryTotal: number; delivered: number; readableTotal: number; read: number }
  >();
  for (const r of receipts) {
    let cur = agg.get(r.messageId);
    cur ??= {
      deliveryTotal: 0,
      delivered: 0,
      readableTotal: 0,
      read: 0,
    };
    cur.deliveryTotal += 1;
    if (r.deliveredAt) cur.delivered += 1;
    if (sharing.get(r.userId)) {
      cur.readableTotal += 1;
      if (r.readAt) cur.read += 1;
    }
    agg.set(r.messageId, cur);
  }

  for (const id of ownIds) {
    const a = agg.get(id);
    out.set(
      id,
      deriveMessageReceiptStatus(
        a ?? { deliveryTotal: 0, delivered: 0, readableTotal: 0, read: 0 },
      ),
    );
  }
  return out;
}

async function reactionsSummariesForMessages(
  prisma: ReturnType<typeof getPrisma>,
  messageIds: string[],
  viewerUserId: string,
): Promise<Map<string, MessageReactionSummary[]>> {
  const out = new Map<string, MessageReactionSummary[]>();
  if (messageIds.length === 0) return out;

  const grouped = await prisma.reaction.groupBy({
    by: ["messageId", "emoji"],
    where: { messageId: { in: messageIds } },
    _count: { _all: true },
  });

  const mine = await prisma.reaction.findMany({
    where: { messageId: { in: messageIds }, userId: viewerUserId },
    select: { messageId: true, emoji: true },
  });
  const mineSet = new Set(mine.map((r) => `${r.messageId}\0${r.emoji}`));

  for (const g of grouped) {
    let list = out.get(g.messageId);
    list ??= [];
    list.push({
      emoji: g.emoji,
      count: g._count._all,
      byMe: mineSet.has(`${g.messageId}\0${g.emoji}`),
    });
    out.set(g.messageId, list);
  }
  for (const [, list] of out) {
    list.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  }
  return out;
}

type ChatMemberListRow = {
  chatId: string;
  pinnedAt: Date | null;
  favoritedAt: Date | null;
  closedAt: Date | null;
  mutedUntil: Date | null;
  chat: {
    id: string;
    type: ChatType;
    title: string | null;
    avatarUrl: string | null;
    e2eeMode: ChatE2eeMode;
    groupVisibility: string | null;
    updatedAt: Date;
    lastMessageAt: Date | null;
    members: Array<{
      userId: string;
      user: {
        id: string;
        email: string;
        displayName: string | null;
        username: string | null;
        avatarUrl: string | null;
        publicKey: string | null;
        keyVersion: number | null;
        isOnline: boolean;
        lastSeenAt: Date | null;
      };
    }>;
  };
};

function sortChatListPage(page: ChatMemberListRow[]): void {
  page.sort((a, b) => {
    const aPin = a.pinnedAt ? a.pinnedAt.getTime() : 0;
    const bPin = b.pinnedAt ? b.pinnedAt.getTime() : 0;
    if (aPin !== bPin) return bPin - aPin;
    const aUpd = a.chat.updatedAt.getTime();
    const bUpd = b.chat.updatedAt.getTime();
    if (aUpd !== bUpd) return bUpd - aUpd;
    return b.chat.id.localeCompare(a.chat.id);
  });
}

async function loadUnreadCountsForChats(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
  chatIds: string[],
): Promise<{ unreadByChat: Map<string, number>; unreadMentionByChat: Map<string, number> }> {
  const unreadByChat = new Map<string, number>();
  const unreadMentionByChat = new Map<string, number>();
  for (const chatId of chatIds) {
    const n = await prisma.receipt.count({
      where: {
        userId,
        readAt: null,
        message: { chatId, deletedAt: null, ...MAIN_FEED_MESSAGE_WHERE },
      },
    });
    unreadByChat.set(chatId, n);

    const unreadReceipts = await prisma.receipt.findMany({
      where: {
        userId,
        readAt: null,
        message: { chatId, deletedAt: null, ...MAIN_FEED_MESSAGE_WHERE },
      },
      select: { message: { select: { contentMeta: true } } },
      take: 200,
    });
    const mentionCount = unreadReceipts.filter((r) =>
      isUserMentioned(userId, r.message.contentMeta),
    ).length;
    unreadMentionByChat.set(chatId, mentionCount);
  }
  return { unreadByChat, unreadMentionByChat };
}

function mapMemberChatListRow(
  m: ChatMemberListRow,
  userId: string,
  lastByChat: Map<string, Awaited<ReturnType<ReturnType<typeof getPrisma>["message"]["findFirst"]>>>,
  lastSummaries: Map<string, MessageReactionSummary[]>,
  unreadByChat: Map<string, number>,
  unreadMentionByChat: Map<string, number>,
): unknown {
  const chat = m.chat;
  const last = lastByChat.get(chat.id);
  let dmPeer: unknown = undefined;
  if (chat.type === "DIRECT") {
    const other = chat.members.find((x) => x.userId !== userId)?.user;
    dmPeer = other
      ? { ...other, avatarUrl: expandAvatarUrl(other.avatarUrl) }
      : null;
  }
  return {
    id: chat.id,
    type: chat.type,
    title: chat.title,
    avatarUrl: expandAvatarUrl(chat.avatarUrl),
    e2eeMode: chat.e2eeMode,
    groupVisibility: chat.type === "GROUP" ? chat.groupVisibility : undefined,
    isMember: true,
    canJoin: false,
    dmPeer,
    lastMessage: last ? publicMessage(last, lastSummaries.get(last.id) ?? []) : null,
    unreadCount: unreadByChat.get(chat.id) ?? 0,
    unreadMentionCount: unreadMentionByChat.get(chat.id) ?? 0,
    pinnedAt: m.pinnedAt ? m.pinnedAt.toISOString() : null,
    favoritedAt: m.favoritedAt ? m.favoritedAt.toISOString() : null,
    closedAt: m.closedAt ? m.closedAt.toISOString() : null,
    updatedAt: chat.updatedAt,
    lastMessageAt: chat.lastMessageAt,
    mutedUntil: m.mutedUntil ? m.mutedUntil.toISOString() : null,
  };
}

async function appendDiscoverablePublicGroups(
  prisma: ReturnType<typeof getPrisma>,
  data: unknown[],
  memberChatIds: Set<string>,
): Promise<void> {
  const discoverable = await prisma.chat.findMany({
    where: {
      type: "GROUP",
      groupVisibility: "PUBLIC",
      ...(memberChatIds.size > 0 ? { id: { notIn: [...memberChatIds] } } : {}),
    },
    take: 30,
    orderBy: { updatedAt: "desc" },
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
      },
    },
  });
  for (const chat of discoverable) {
    const last = await prisma.message.findFirst({
      where: { chatId: chat.id, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    data.push({
      id: chat.id,
      type: chat.type,
      title: chat.title,
      avatarUrl: expandAvatarUrl(chat.avatarUrl),
      e2eeMode: chat.e2eeMode,
      groupVisibility: chat.groupVisibility,
      isMember: false,
      canJoin: true,
      dmPeer: undefined,
      lastMessage: last ? publicMessage(last, []) : null,
      unreadCount: 0,
      unreadMentionCount: 0,
      updatedAt: chat.updatedAt,
      lastMessageAt: chat.lastMessageAt,
      pinnedAt: null,
      favoritedAt: null,
      closedAt: null,
      mutedUntil: null,
    });
  }
}

export async function listChats(
  userId: string,
  opts: { limit: number; cursor?: string; type?: ChatType },
): Promise<{ data: unknown[]; nextCursor: string | null }> {
  const prisma = getPrisma();
  const cursorWhere = buildChatListCursorWhere(opts.cursor);

  const rows = await prisma.chatMember.findMany({
    where: {
      userId,
      leftAt: null,
      chat: {
        ...(opts.type ? { type: opts.type } : {}),
        ...cursorWhere,
      },
    },
    take: opts.limit + 1,
    orderBy: [{ chat: { updatedAt: "desc" } }, { chat: { id: "desc" } }],
    include: {
      chat: {
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
                  publicKey: true,
                  keyVersion: true,
                  isOnline: true,
                  lastSeenAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const page = rows.slice(0, opts.limit) as ChatMemberListRow[];
  sortChatListPage(page);
  const chatIds = page.map((r) => r.chatId);

  const lastByChat = new Map<string, Awaited<ReturnType<typeof prisma.message.findFirst>>>();
  for (const chatId of chatIds) {
    const last = await prisma.message.findFirst({
      where: { chatId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (last) lastByChat.set(chatId, last);
  }

  const { unreadByChat, unreadMentionByChat } = await loadUnreadCountsForChats(prisma, userId, chatIds);

  const lastMessageIds = [...lastByChat.values()].map((lm) => lm?.id).filter((id): id is string => Boolean(id));
  const lastSummaries = await reactionsSummariesForMessages(prisma, lastMessageIds, userId);

  const data = page
    .map((m) =>
      mapMemberChatListRow(m, userId, lastByChat, lastSummaries, unreadByChat, unreadMentionByChat),
    )
    .filter((row) => {
      const r = row as { type: string; dmPeer: unknown };
      return r.type !== "DIRECT" || r.dmPeer != null;
    });

  const memberChatIds = new Set(page.map((r) => r.chatId));
  if ((!opts.type || opts.type === "GROUP") && (!opts.cursor || opts.cursor.length === 0)) {
    await appendDiscoverablePublicGroups(prisma, data, memberChatIds);
  }

  const lastRow = page.at(-1);
  const nextCursor =
    rows.length > opts.limit && lastRow
      ? encodeMessageCursor(lastRow.chat.updatedAt, lastRow.chat.id)
      : null;

  return { data, nextCursor };
}

export async function patchChatMute(userId: string, chatId: string, mutedUntil: Date | null): Promise<void> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  await prisma.chatMember.updateMany({
    where: { chatId, userId, leftAt: null },
    data: { mutedUntil },
  });
}

export async function patchChatPin(userId: string, chatId: string, pinned: boolean): Promise<void> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  await prisma.chatMember.updateMany({
    where: { chatId, userId, leftAt: null },
    data: { pinnedAt: pinned ? new Date() : null },
  });
}

export async function patchChatFavorite(userId: string, chatId: string, favorited: boolean): Promise<void> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
  if (chat?.type !== "DIRECT" && chat?.type !== "GROUP") {
    throw new AppError(400, "INVALID_CHAT", "Only chats can be favorited");
  }
  await prisma.chatMember.updateMany({
    where: { chatId, userId, leftAt: null },
    data: { favoritedAt: favorited ? new Date() : null },
  });
}

export async function patchChatClose(userId: string, chatId: string, closed: boolean): Promise<void> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
  if (chat?.type !== "DIRECT") {
    throw new AppError(400, "INVALID_CHAT", "Only direct messages can be closed");
  }
  await prisma.chatMember.updateMany({
    where: { chatId, userId, leftAt: null },
    data: { closedAt: closed ? new Date() : null },
  });
}

export async function patchChatE2eeMode(userId: string, chatId: string, e2eeMode: ChatE2eeMode): Promise<void> {
  await requireActiveMemberMinRole(userId, chatId, "ADMIN");
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, e2eeMode: true } });
  if (!chat) {
    throw new AppError(404, "NOT_FOUND", "Chat not found");
  }
  if (chat.type === "DIRECT") {
    if (e2eeMode === "NONE") {
      throw new AppError(403, "E2EE_MANDATORY", "Direct chats always use mandatory E2EE");
    }
    if (e2eeMode !== "DM_V1") {
      throw new AppError(400, "INVALID_CHAT", "Direct chats only support DM_V1");
    }
  } else if (chat.type === "GROUP") {
    if (e2eeMode !== "NONE" && e2eeMode !== "GROUP_V1") {
      throw new AppError(400, "INVALID_CHAT", "Groups support NONE or GROUP_V1");
    }
  }
  await prisma.chat.update({
    where: { id: chatId },
    data: { e2eeMode },
  });
}

export async function getChat(userId: string, chatId: string) {
  await requireActiveMember(userId, chatId);
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
              publicKey: true,
              keyVersion: true,
              isOnline: true,
              lastSeenAt: true,
            },
          },
        },
      },
    },
  });
  if (!chat) {
    throw new AppError(404, "NOT_FOUND", "Chat not found");
  }
  return chat;
}

async function createDirectChat(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
  otherUserId: string,
) {
  if (otherUserId === userId) {
    throw new AppError(400, "INVALID_DM", "Cannot create a DM with yourself");
  }
  if (await isBlockedPair(userId, otherUserId)) {
    throw new AppError(403, "BLOCKED", "Cannot message this user");
  }
  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other?.id || other.deletedAt) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  const dmKey = pairKeyForUserIds(userId, otherUserId);
  const existing = await prisma.chat.findUnique({
    where: { dmKey },
    include: { members: { where: { leftAt: null } } },
  });
  if (existing?.type === "DIRECT") {
    await prisma.chatMember.updateMany({
      where: { chatId: existing.id, userId, leftAt: null },
      data: { closedAt: null },
    });
    if (existing.e2eeMode === "NONE") {
      const upgraded = await prisma.chat.update({
        where: { id: existing.id },
        data: { e2eeMode: "DM_V1" },
        include: chatWithActiveMembersUserInclude,
      });
      return { chat: upgraded, created: false };
    }
    return { chat: existing, created: false };
  }
  const chat = await prisma.$transaction(async (tx) => {
    const c = await tx.chat.create({
      data: {
        type: "DIRECT",
        dmKey,
        createdById: userId,
        e2eeMode: "DM_V1",
      },
    });
    await tx.chatMember.createMany({
      data: [
        { chatId: c.id, userId, role: "OWNER" },
        { chatId: c.id, userId: otherUserId, role: "MEMBER" },
      ],
    });
    return tx.chat.findUniqueOrThrow({
      where: { id: c.id },
      include: chatWithActiveMembersUserInclude,
    });
  });
  return { chat, created: true };
}

async function createGroupChat(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
  body: {
    title: string;
    memberIds?: string[];
    e2eeMode?: "NONE" | "GROUP_V1";
    groupVisibility?: "PRIVATE" | "PUBLIC";
  },
) {
  const memberSet = new Set<string>([userId, ...(body.memberIds ?? [])]);
  const memberIds = [...memberSet];
  for (const uid of memberIds) {
    if (uid !== userId && (await isBlockedPair(userId, uid))) {
      throw new AppError(403, "BLOCKED", "Cannot add a blocked user to the group");
    }
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u?.id || u.deletedAt) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }
  }

  const groupE2ee = body.e2eeMode === "GROUP_V1" ? "GROUP_V1" : "NONE";
  const groupVisibility = body.groupVisibility ?? "PRIVATE";

  const chat = await prisma.$transaction(async (tx) => {
    const c = await tx.chat.create({
      data: {
        type: "GROUP",
        title: body.title,
        createdById: userId,
        e2eeMode: groupE2ee,
        groupVisibility,
      },
    });
    await tx.chatMember.createMany({
      data: memberIds.map((uid) => ({
        chatId: c.id,
        userId: uid,
        role: uid === userId ? "OWNER" : "MEMBER",
      })),
    });
    return tx.chat.findUniqueOrThrow({
      where: { id: c.id },
      include: chatWithActiveMembersUserInclude,
    });
  });
  const actorName = await resolveDisplayName(userId);
  void publishGroupActivityMessage({
    chatId: chat.id,
    senderId: userId,
    meta: { type: "group_created", actorId: userId, actorName, title: body.title },
  }).catch(() => {});
  for (const uid of memberIds) {
    if (uid === userId) continue;
    const targetName = await resolveDisplayName(uid);
    void publishGroupActivityMessage({
      chatId: chat.id,
      senderId: userId,
      meta: {
        type: "member_joined",
        actorId: userId,
        actorName,
        targetUserId: uid,
        targetName,
      },
    }).catch(() => {});
  }
  return { chat, created: true };
}

export async function createChat(
  userId: string,
  body:
    | { type: "DIRECT"; otherUserId: string }
    | {
        type: "GROUP";
        title: string;
        memberIds?: string[];
        e2eeMode?: "NONE" | "GROUP_V1";
        groupVisibility?: "PRIVATE" | "PUBLIC";
      },
) {
  const prisma = getPrisma();
  if (body.type === "DIRECT") {
    return createDirectChat(prisma, userId, body.otherUserId);
  }
  return createGroupChat(prisma, userId, body);
}

export async function listMessages(
  userId: string,
  chatId: string,
  opts: { limit: number; cursor?: string },
): Promise<{ data: ReturnType<typeof publicMessage>[]; nextCursor: string | null }> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const cursorWhere = buildDescMessageCursorWhere(opts.cursor);

  const rows = await prisma.message.findMany({
    where: {
      chatId,
      deletedAt: null,
      OR: [{ threadRootId: null }, { broadcastToChannel: true }],
      ...cursorWhere,
    },
    take: opts.limit + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: messageWithSenderInclude,
  });

  const page = rows.slice(0, opts.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > opts.limit && last ? encodeMessageCursor(last.createdAt, last.id) : null;

  const pageIds = page.map((r) => r.id);
  const summaries = await reactionsSummariesForMessages(prisma, pageIds, userId);
  const receiptStatuses = await receiptStatusForMessages(prisma, pageIds, userId);
  return {
    data: page.map((row) =>
      publicMessage(
        row,
        summaries.get(row.id) ?? [],
        receiptStatuses.get(row.id),
        replyPreviewFromRow(row),
      ),
    ),
    nextCursor,
  };
}

const SEARCH_MESSAGE_KINDS: MessageKind[] = ["TEXT", "IMAGE", "FILE", "POLL", "OTHER"];

function buildSearchSnippet(ciphertext: string, q: string, maxLen = 120): string {
  const lower = ciphertext.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) {
    return ciphertext.length <= maxLen ? ciphertext : `${ciphertext.slice(0, maxLen)}…`;
  }
  const half = Math.floor((maxLen - needle.length) / 2);
  const start = Math.max(0, idx - half);
  let snippet = ciphertext.slice(start, start + maxLen);
  if (start > 0) snippet = `…${snippet}`;
  if (start + maxLen < ciphertext.length) snippet = `${snippet}…`;
  return snippet;
}

export type SearchMessageHit = {
  messageId: string;
  createdAt: Date;
  snippet: string;
  sender: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    username: string | null;
  };
};

export async function searchMessagesInChat(
  userId: string,
  chatId: string,
  q: string,
  opts: { limit: number; cursor?: string },
): Promise<{
  data: SearchMessageHit[];
  nextCursor: string | null;
  searchUnavailable?: boolean;
}> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true, e2eeMode: true },
  });
  const isE2ee = chat ? resolveChatE2eeFlags(chat).isE2ee : false;
  if (isE2ee) {
    return { data: [], nextCursor: null, searchUnavailable: true };
  }

  const pattern = `%${escapeIlikePattern(q)}%`;
  const cursorFilter = buildSearchMessageCursorFilter(opts.cursor);

  type SearchRow = {
    id: string;
    createdAt: Date;
    ciphertext: string | null;
    sender_id: string;
    sender_email: string;
    sender_displayName: string | null;
    sender_avatarUrl: string | null;
    sender_username: string | null;
  };

  const rows = await prisma.$queryRaw<SearchRow[]>`
    SELECT
      m.id,
      m."createdAt",
      m.ciphertext,
      u.id AS "sender_id",
      u.email AS "sender_email",
      u."displayName" AS "sender_displayName",
      u."avatarUrl" AS "sender_avatarUrl",
      u.username AS "sender_username"
    FROM "Message" m
    INNER JOIN "User" u ON u.id = m."senderId"
    WHERE m."chatId" = ${chatId}
      AND m."deletedAt" IS NULL
      AND m.kind::text IN (${Prisma.join(SEARCH_MESSAGE_KINDS)})
      AND m.ciphertext IS NOT NULL
      AND m.ciphertext ILIKE ${pattern} ESCAPE '\\'
      ${cursorFilter}
    ORDER BY m."createdAt" DESC, m.id DESC
    LIMIT ${opts.limit + 1}
  `;

  const page = rows.slice(0, opts.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > opts.limit && last ? encodeMessageCursor(last.createdAt, last.id) : null;

  return {
    data: page.map((row) => ({
      messageId: row.id,
      createdAt: row.createdAt,
      snippet: buildSearchSnippet(row.ciphertext ?? "", q),
      sender: {
        id: row.sender_id,
        email: row.sender_email,
        displayName: row.sender_displayName,
        avatarUrl: expandAvatarUrl(row.sender_avatarUrl),
        username: row.sender_username,
      },
    })),
    nextCursor,
  };
}

export async function listThreadMessages(
  userId: string,
  chatId: string,
  rootMessageId: string,
  opts: { limit: number; cursor?: string },
): Promise<{ data: ReturnType<typeof publicMessage>[]; nextCursor: string | null; root: ReturnType<typeof publicMessage> }> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();

  const rootRow = await prisma.message.findFirst({
    where: { id: rootMessageId, chatId, deletedAt: null, threadRootId: null },
    include: messageWithSenderInclude,
  });
  if (!rootRow) {
    throw new AppError(404, "NOT_FOUND", "Thread root not found");
  }

  const cursorWhere = buildAscThreadCursorWhere(opts.cursor);

  const rows = await prisma.message.findMany({
    where: {
      chatId,
      threadRootId: rootMessageId,
      deletedAt: null,
      ...cursorWhere,
    },
    take: opts.limit + 1,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: messageWithSenderInclude,
  });

  const page = rows.slice(0, opts.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > opts.limit && last ? encodeMessageCursor(last.createdAt, last.id) : null;

  const pageIds = page.map((r) => r.id);
  const summaries = await reactionsSummariesForMessages(prisma, pageIds, userId);
  const receiptStatuses = await receiptStatusForMessages(prisma, pageIds, userId);

  const rootSums = await reactionsSummariesForMessages(prisma, [rootRow.id], userId);
  const rootReceipt = await receiptStatusForMessages(prisma, [rootRow.id], userId);

  return {
    root: publicMessage(
      rootRow,
      rootSums.get(rootRow.id) ?? [],
      rootReceipt.get(rootRow.id),
      replyPreviewFromRow(rootRow),
    ),
    data: page.map((row) =>
      publicMessage(
        row,
        summaries.get(row.id) ?? [],
        receiptStatuses.get(row.id),
        replyPreviewFromRow(row),
      ),
    ),
    nextCursor,
  };
}

async function loadIdempotentCreateMessageResult(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
  chatId: string,
  clientMessageId: string,
) {
  const existing = await prisma.message.findUnique({
    where: { chatId_clientMessageId: { chatId, clientMessageId } },
    include: messageWithSenderInclude,
  });
  if (!existing) return null;
  const sumMap = await reactionsSummariesForMessages(prisma, [existing.id], userId);
  const receiptMap = await receiptStatusForMessages(prisma, [existing.id], userId);
  return {
    message: publicMessage(
      existing,
      sumMap.get(existing.id) ?? [],
      receiptMap.get(existing.id),
      replyPreviewFromRow(existing),
    ),
    idempotent: true as const,
  };
}

async function resolveCreateMessageThread(
  chatId: string,
  input: { threadRootId?: string | null; broadcastToChannel?: boolean },
) {
  if (input.threadRootId) {
    return {
      canonicalThreadRootId: await resolveCanonicalThreadRoot(chatId, input.threadRootId),
      broadcastToChannel: Boolean(input.broadcastToChannel),
    };
  }
  if (input.broadcastToChannel) {
    throw new AppError(400, "INVALID_THREAD", "broadcastToChannel requires threadRootId");
  }
  return { canonicalThreadRootId: null, broadcastToChannel: false };
}

export async function createMessage(
  userId: string,
  chatId: string,
  input: {
    clientMessageId: string;
    kind: MessageKind;
    ciphertext?: string | null;
    contentMeta?: Record<string, unknown> | null;
    replyToId?: string | null;
    threadRootId?: string | null;
    broadcastToChannel?: boolean;
  },
): Promise<{
  message: ReturnType<typeof publicMessage>;
  idempotent: boolean;
  threadUpdated?: { rootMessageId: string; replyCount: number; lastReplyAt: Date };
}> {
  const me = await requireActiveMember(userId, chatId);
  const prisma = getPrisma();

  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, e2eeMode: true } });
  if (!chat) {
    throw new AppError(404, "NOT_FOUND", "Chat not found");
  }
  const { isE2ee } = resolveChatE2eeFlags(chat);
  assertE2eeMessageInput(isE2ee, input.ciphertext, input.contentMeta);

  const idempotentHit = await loadIdempotentCreateMessageResult(
    prisma,
    userId,
    chatId,
    input.clientMessageId,
  );
  if (idempotentHit) return idempotentHit;

  const { canonicalThreadRootId, broadcastToChannel } = await resolveCreateMessageThread(
    chatId,
    input,
  );

  if (input.replyToId) {
    const parent = await prisma.message.findFirst({
      where: { id: input.replyToId, chatId, deletedAt: null },
    });
    if (!parent) {
      throw new AppError(400, "INVALID_REPLY", "Reply target not in this chat");
    }
  }

  let contentMetaForInsert = input.contentMeta;
  if (isPlainObject(contentMetaForInsert) && chat.type === "GROUP") {
    contentMetaForInsert = await validateAndMergeMentions(
      userId,
      chatId,
      me.role,
      contentMetaForInsert,
    );
  }
  const cfg = loadConfig();
  const textBody = input.ciphertext ?? "";
  const enriched = enrichTextMessageContentMeta({
    kind: input.kind,
    isE2ee,
    linkPreviewEnabled: cfg.linkPreviewEnabled,
    textBody,
    contentMeta: contentMetaForInsert,
  });
  contentMetaForInsert = enriched.contentMeta;
  const schedulePreviewEnrichment = enriched.schedulePreviewEnrichment;

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        chatId,
        senderId: userId,
        clientMessageId: input.clientMessageId,
        kind: input.kind,
        ciphertext: input.ciphertext ?? null,
        contentMeta: contentMetaToPrismaInput(contentMetaForInsert),
        replyToId: input.replyToId ?? null,
        threadRootId: canonicalThreadRootId,
        broadcastToChannel,
      },
      include: messageWithSenderInclude,
    });
    await touchChatAfterOutboundMessage(tx, chatId, userId, msg.id, msg.createdAt);
    let threadUpdated: { rootMessageId: string; replyCount: number; lastReplyAt: Date } | undefined;
    if (canonicalThreadRootId) {
      const root = await tx.message.update({
        where: { id: canonicalThreadRootId },
        data: {
          threadReplyCount: { increment: 1 },
          threadLastReplyAt: msg.createdAt,
        },
        select: { id: true, threadReplyCount: true, threadLastReplyAt: true },
      });
      threadUpdated = {
        rootMessageId: root.id,
        replyCount: root.threadReplyCount,
        lastReplyAt: root.threadLastReplyAt ?? msg.createdAt,
      };
    }
    await tx.chatMember.updateMany({
      where: { chatId, leftAt: null, closedAt: { not: null } },
      data: { closedAt: null },
    });
    return { msg, threadUpdated };
  });

  await bindUploadsToMessage(message.msg.id, chatId, contentMetaForInsert ?? null);

  const published = publicMessage(message.msg, [], "sent", replyPreviewFromRow(message.msg));
  void notifyNewMessage({ senderId: userId, chatId, message: published }).catch(() => {});

  if (schedulePreviewEnrichment) {
    scheduleMessageLinkPreviewEnrichment(message.msg.id, chatId, textBody);
  }

  return {
    message: published,
    idempotent: false,
    threadUpdated: message.threadUpdated,
  };
}

/** Fetch OG metadata after send so message:send / REST are not blocked on network I/O. */
function scheduleMessageLinkPreviewEnrichment(
  messageId: string,
  chatId: string,
  text: string,
): void {
  void (async () => {
    try {
      const preview = await fetchLinkPreviewForText(text);
      if (!preview) return;

      const prisma = getPrisma();
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        include: messageWithSenderInclude,
      });
      if (!msg || msg.deletedAt) return;

      const meta = msg.contentMeta;
      if (isPlainObject(meta) && meta.preview != null) {
        return;
      }

      const nextMeta = mergeLinkPreviewIntoMeta(isPlainObject(meta) ? meta : {}, preview);

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { contentMeta: nextMeta as Prisma.InputJsonValue },
        include: messageWithSenderInclude,
      });

      const published = publicMessage(updated, [], "sent", replyPreviewFromRow(updated));
      const io = getSocketIo();
      if (io) {
        await emitToChatMembers(io, chatId, "message:updated", {
          v: SOCKET_PROTOCOL_VERSION,
          chatId,
          message: published,
        });
      }
    } catch {
      /* best-effort background enrichment */
    }
  })();
}

export async function patchMessage(
  userId: string,
  messageId: string,
  data: { ciphertext?: string | null; contentMeta?: Record<string, unknown> | null },
) {
  const { prisma, msg } = await requireMessageModifyAccess(
    userId,
    messageId,
    "Cannot edit this message",
  );
  const chat = await prisma.chat.findUnique({ where: { id: msg.chatId }, select: { type: true, e2eeMode: true } });
  if (chat && resolveChatE2eeFlags(chat).isE2eeDm) {
    assertE2eePatchPayload(data);
  }
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: buildMessagePatchUpdateData(data),
  });
  const sumMap = await reactionsSummariesForMessages(prisma, [updated.id], userId);
  return publicMessage(updated, sumMap.get(updated.id) ?? []);
}

export async function deleteMessage(userId: string, messageId: string) {
  const { prisma, msg } = await requireMessageModifyAccess(
    userId,
    messageId,
    "Cannot delete this message",
  );

  await prisma.pinnedMessage.deleteMany({ where: { messageId } });

  const now = new Date();
  await prisma.receipt.updateMany({
    where: { messageId, readAt: null },
    data: { readAt: now, deliveredAt: now },
  });

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });

  const { uploadDir } = loadConfig();
  await purgeUploadsForMessage(uploadDir, msg.contentMeta, messageId);

  return publicMessage(updated, []);
}

export async function addReaction(userId: string, messageId: string, emoji: string) {
  const { prisma, msg } = await requireMessageInChat(userId, messageId);
  await prisma.reaction.upsert({
    where: {
      messageId_userId_emoji: { messageId, userId, emoji },
    },
    create: { messageId, userId, emoji },
    update: {},
  });
  return { messageId, emoji, chatId: msg.chatId };
}

export async function removeReaction(userId: string, messageId: string, emoji: string) {
  const { prisma, msg } = await requireExistingMessageInChat(userId, messageId);
  try {
    await prisma.reaction.delete({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });
  } catch {
    /* noop */
  }
  return { messageId, emoji, chatId: msg.chatId };
}

export async function listPins(userId: string, chatId: string) {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const pins = await prisma.pinnedMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    include: {
      message: { include: messageWithSenderInclude },
      pinnedBy: { select: senderSelect },
    },
  });
  const messageIds = pins.map((p) => p.messageId);
  const summaries = await reactionsSummariesForMessages(prisma, messageIds, userId);
  const data = pins
    .filter((p) => p.message && !p.message.deletedAt)
    .map((p) => ({
      messageId: p.messageId,
      pinnedById: p.pinnedById,
      createdAt: p.createdAt,
      pinnedBy: p.pinnedBy
        ? {
            id: p.pinnedBy.id,
            email: p.pinnedBy.email,
            displayName: p.pinnedBy.displayName,
            avatarUrl: expandAvatarUrl(p.pinnedBy.avatarUrl),
            username: p.pinnedBy.username,
          }
        : undefined,
      message: publicMessage(
        p.message,
        summaries.get(p.messageId) ?? [],
        undefined,
        replyPreviewFromRow(p.message),
      ),
    }));
  return { data };
}

export async function pinMessage(userId: string, messageId: string) {
  const { prisma, msg } = await requirePinMessageAccess(userId, messageId, { rejectDeleted: true });
  await prisma.pinnedMessage.upsert({
    where: { chatId_messageId: { chatId: msg.chatId, messageId } },
    create: { chatId: msg.chatId, messageId, pinnedById: userId },
    update: { pinnedById: userId },
  });
  return { chatId: msg.chatId, messageId };
}

export async function unpinMessage(userId: string, messageId: string) {
  const { prisma, msg } = await requirePinMessageAccess(userId, messageId, { rejectDeleted: false });
  await prisma.pinnedMessage.deleteMany({ where: { chatId: msg.chatId, messageId } });
  return { chatId: msg.chatId, messageId };
}

export async function createPollOnChat(
  userId: string,
  chatId: string,
  input: {
    question: string;
    closesAt?: Date | null;
    options: string[];
    ciphertext?: string | null;
    contentMeta?: Record<string, unknown> | null;
    clientMessageId?: string | null;
  },
): Promise<{
  poll: Awaited<ReturnType<typeof getPollForUser>>;
  message: ReturnType<typeof publicMessage>;
}> {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true, e2eeMode: true },
  });
  if (!chat) {
    throw new AppError(404, "NOT_FOUND", "Chat not found");
  }
  const { isE2eeDm } = resolveChatE2eeFlags(chat);
  if (isE2eeDm) {
    if (!input.ciphertext?.length) {
      throw new AppError(400, "E2EE_REQUIRED", "This chat requires ciphertext-only poll messages");
    }
    const meta = input.contentMeta ?? null;
    if (!meta || typeof meta !== "object") {
      throw new AppError(400, "E2EE_META_REQUIRED", "This chat requires E2EE contentMeta");
    }
    if (!isE2eeContentMeta(meta)) {
      throw new AppError(400, "E2EE_META_INVALID", "contentMeta.e2eeVersion is required for E2EE DMs");
    }
  }

  const { poll: createdPoll, message: rawMessage } = await prisma.$transaction(async (tx) => {
    const p = await tx.poll.create({
      data: {
        chatId,
        question: isE2eeDm ? "" : input.question.trim(),
        closesAt: input.closesAt ?? null,
        createdById: userId,
      },
    });
    await tx.pollOption.createMany({
      data: input.options.map((_label, idx) => ({
        pollId: p.id,
        label: isE2eeDm ? `·${idx}` : _label.trim(),
        sortOrder: idx,
      })),
    });
    const optionRows = await tx.pollOption.findMany({
      where: { pollId: p.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });
    const contentMetaForInsert = isE2eeDm
      ? buildE2eePollContentMeta(input.contentMeta, p.id, optionRows)
      : ({ pollId: p.id } as Prisma.InputJsonValue);
    const msg = await tx.message.create({
      data: {
        chatId,
        senderId: userId,
        clientMessageId: input.clientMessageId ?? `poll:${p.id}`,
        kind: "POLL",
        ciphertext: isE2eeDm ? input.ciphertext! : null,
        contentMeta: contentMetaForInsert,
        replyToId: null,
      },
    });
    await tx.poll.update({ where: { id: p.id }, data: { messageId: msg.id } });
    await touchChatAfterOutboundMessage(tx, chatId, userId, msg.id, msg.createdAt);
    const fullPoll = await tx.poll.findUniqueOrThrow({
      where: { id: p.id },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    });
    return { poll: fullPoll, message: msg };
  });

  const msgRow = await prisma.message.findUniqueOrThrow({
    where: { id: rawMessage.id },
    include: messageWithSenderInclude,
  });
  const published = publicMessage(msgRow, [], "sent", replyPreviewFromRow(msgRow));
  void notifyNewMessage({ senderId: userId, chatId, message: published }).catch(() => {});

  const pollSnapshot = await getPollForUser(userId, createdPoll.id);
  return { poll: pollSnapshot, message: published };
}

/** Group metadata: title / avatar / visibility - ADMIN+ */
export async function patchGroupChat(
  userId: string,
  chatId: string,
  data: { title?: string; avatarUrl?: string | null; groupVisibility?: "PRIVATE" | "PUBLIC" },
) {
  const member = await requireActiveMemberMinRole(userId, chatId, "ADMIN");
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (chat?.type !== "GROUP") {
    throw new AppError(404, "NOT_FOUND", "Group not found");
  }
  if (!canManageGroupMeta(member.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const patchData = buildGroupChatPatchData(data);
  if (data.avatarUrl !== undefined) {
    patchData.avatarUrl = normalizeAvatarDbValue(data.avatarUrl);
  }
  const updated = await prisma.chat.update({
    where: { id: chatId },
    data: patchData,
    include: chatWithActiveMembersUserInclude,
  });
  const actorName = await resolveDisplayName(userId);
  if (data.title !== undefined && data.title !== chat.title) {
    void publishGroupActivityMessage({
      chatId,
      senderId: userId,
      meta: { type: "title_changed", actorId: userId, actorName, title: data.title },
    }).catch(() => {});
  }
  if (data.avatarUrl !== undefined && data.avatarUrl !== chat.avatarUrl) {
    const { uploadDir } = loadConfig();
    await deleteReplacedAvatarUpload(uploadDir, chat.avatarUrl, data.avatarUrl);
    void publishGroupActivityMessage({
      chatId,
      senderId: userId,
      meta: { type: "avatar_changed", actorId: userId, actorName },
    }).catch(() => {});
  }
  return updated;
}

/** Self-join a public group. Private groups require an invite from owner or moderator. */
export async function joinPublicGroup(userId: string, chatId: string) {
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (chat?.type !== "GROUP") {
    throw new AppError(404, "NOT_FOUND", "Group not found");
  }
  if (chat.groupVisibility !== "PUBLIC") {
    throw new AppError(
      403,
      "PRIVATE_GROUP",
      "This group is private. Only owners or moderators can add members.",
    );
  }
  const existing = await prisma.chatMember.findFirst({
    where: { chatId, userId },
  });
  if (existing?.leftAt === null) {
    return prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: chatWithActiveMembersUserInclude,
    });
  }
  if (existing) {
    await prisma.chatMember.update({
      where: { id: existing.id },
      data: { leftAt: null, role: "MEMBER", joinedAt: new Date() },
    });
  } else {
    await prisma.chatMember.create({
      data: { chatId, userId, role: "MEMBER" },
    });
  }
  const chatOut = await prisma.chat.findUniqueOrThrow({
    where: { id: chatId },
    include: chatWithActiveMembersUserInclude,
  });
  const actorName = await resolveDisplayName(userId);
  void publishGroupActivityMessage({
    chatId,
    senderId: userId,
    meta: {
      type: "member_joined",
      actorId: userId,
      actorName,
      targetUserId: userId,
      targetName: actorName,
    },
  }).catch(() => {});
  return chatOut;
}

export async function addGroupMember(userId: string, chatId: string, newUserId: string) {
  if (newUserId === userId) {
    throw new AppError(400, "INVALID", "Already a member");
  }
  if (await isBlockedPair(userId, newUserId)) {
    throw new AppError(403, "BLOCKED", "Cannot add this user");
  }
  const actor = await requireActiveMemberMinRole(userId, chatId, "MOD");
  if (!canInviteGroupMembers(actor.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions to add members");
  }
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (chat?.type !== "GROUP") {
    throw new AppError(404, "NOT_FOUND", "Group not found");
  }
  const target = await prisma.user.findUnique({ where: { id: newUserId } });
  if (!target?.id || target.deletedAt) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  const existing = await prisma.chatMember.findFirst({
    where: { chatId, userId: newUserId },
  });
  if (existing?.leftAt === null) {
    throw new AppError(409, "ALREADY_MEMBER", "User is already a member");
  }
  if (existing) {
    await prisma.chatMember.update({
      where: { id: existing.id },
      data: { leftAt: null, role: "MEMBER", joinedAt: new Date() },
    });
  } else {
    await prisma.chatMember.create({
      data: { chatId, userId: newUserId, role: "MEMBER" },
    });
  }
  const chatOut = await prisma.chat.findUniqueOrThrow({
    where: { id: chatId },
    include: chatWithActiveMembersUserInclude,
  });
  const actorName = await resolveDisplayName(userId);
  const targetName = await resolveDisplayName(newUserId);
  void publishGroupActivityMessage({
    chatId,
    senderId: userId,
    meta: {
      type: "member_joined",
      actorId: userId,
      actorName,
      targetUserId: newUserId,
      targetName,
    },
  }).catch(() => {});
  return chatOut;
}

export async function removeGroupMember(actorId: string, chatId: string, targetUserId: string) {
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (chat?.type !== "GROUP") {
    throw new AppError(404, "NOT_FOUND", "Group not found");
  }
  const actor = await requireActiveMember(actorId, chatId);
  const target = await prisma.chatMember.findFirst({
    where: { chatId, userId: targetUserId, leftAt: null },
  });
  if (!target) {
    throw new AppError(404, "NOT_FOUND", "Member not found");
  }
  if (target.role === "OWNER" && actorId !== targetUserId) {
    throw new AppError(403, "FORBIDDEN", "Cannot remove the owner");
  }
  if (actorId !== targetUserId) {
    if (!roleAtLeast(actor.role, "ADMIN")) {
      throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
    }
    if (roleRank(actor.role) <= roleRank(target.role)) {
      throw new AppError(403, "FORBIDDEN", "Cannot remove this member");
    }
  }
  await prisma.chatMember.update({
    where: { id: target.id },
    data: { leftAt: new Date() },
  });
  const actorName = await resolveDisplayName(actorId);
  const targetName = await resolveDisplayName(targetUserId);
  const isSelf = actorId === targetUserId;
  void publishGroupActivityMessage({
    chatId,
    senderId: actorId,
    meta: isSelf
      ? { type: "member_left", actorId, actorName, targetUserId, targetName }
      : {
          type: "member_removed",
          actorId,
          actorName,
          targetUserId,
          targetName,
        },
  }).catch(() => {});
}

export async function patchGroupMemberRole(
  actorId: string,
  chatId: string,
  targetUserId: string,
  newRole: "ADMIN" | "MOD" | "MEMBER",
) {
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (chat?.type !== "GROUP") {
    throw new AppError(404, "NOT_FOUND", "Group not found");
  }
  await requireActiveMemberMinRole(actorId, chatId, "OWNER");
  const target = await prisma.chatMember.findFirst({
    where: { chatId, userId: targetUserId, leftAt: null },
  });
  if (!target) {
    throw new AppError(404, "NOT_FOUND", "Member not found");
  }
  if (target.userId === actorId) {
    throw new AppError(400, "INVALID", "Cannot change your own role here");
  }
  if (target.role === "OWNER") {
    throw new AppError(403, "FORBIDDEN", "Cannot change the owner role");
  }
  await prisma.chatMember.update({
    where: { id: target.id },
    data: { role: newRole },
  });
  const actorName = await resolveDisplayName(actorId);
  const targetName = await resolveDisplayName(targetUserId);
  void publishGroupActivityMessage({
    chatId,
    senderId: actorId,
    meta: {
      type: "role_changed",
      actorId,
      actorName,
      targetUserId,
      targetName,
      newRole: newRole,
    },
  }).catch(() => {});
}

export async function markMessagesDelivered(userId: string, chatId: string, messageIds: string[]) {
  if (messageIds.length === 0) {
    return { chatId, messageIds: [] as string[], deliveredAt: null as Date | null };
  }
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const unique = [...new Set(messageIds)];
  const n = await prisma.message.count({
    where: { chatId, id: { in: unique }, deletedAt: null },
  });
  if (n !== unique.length) {
    throw new AppError(400, "INVALID_MESSAGES", "Some messages are not in this chat");
  }
  const now = new Date();
  await prisma.receipt.updateMany({
    where: {
      userId,
      messageId: { in: unique },
      deliveredAt: null,
    },
    data: { deliveredAt: now },
  });
  return { chatId, messageIds: unique, deliveredAt: now };
}

export type ReconnectDeliveryFlushOptions = {
  pageSize: number;
  budgetMs: number;
};

export type ReconnectDeliveryFlushResult = {
  batches: Array<{ chatId: string; messageIds: string[]; deliveredAt: Date }>;
  hasMore: boolean;
};

/**
 * Messages sent while this user was offline never triggered `message:new` → no delivery ack.
 * On reconnect, mark pending receipts within a bounded work budget so connect stays snappy.
 */
export async function flushUndeliveredReceiptsOnReconnect(
  userId: string,
  opts: ReconnectDeliveryFlushOptions,
): Promise<ReconnectDeliveryFlushResult> {
  const prisma = getPrisma();
  const now = new Date();
  const startedAt = Date.now();
  const pageSize = Math.max(1, opts.pageSize);
  const budgetMs = Math.max(1, opts.budgetMs);

  const pendingWhere = {
    userId,
    deliveredAt: null,
    message: {
      deletedAt: null,
      chat: {
        members: {
          some: { userId, leftAt: null },
        },
      },
    },
  } as const;

  const batches: Array<{ chatId: string; messageIds: string[]; deliveredAt: Date }> = [];
  let hasMore = false;

  for (;;) {
    const pending = await prisma.receipt.findMany({
      where: pendingWhere,
      orderBy: { message: { createdAt: "desc" } },
      take: pageSize,
      select: {
        messageId: true,
        message: { select: { chatId: true } },
      },
    });

    if (pending.length === 0) {
      break;
    }

    const messageIds = [...new Set(pending.map((p) => p.messageId))];
    await prisma.receipt.updateMany({
      where: {
        userId,
        messageId: { in: messageIds },
        deliveredAt: null,
      },
      data: { deliveredAt: now },
    });

    const byChat = new Map<string, string[]>();
    for (const row of pending) {
      const list = byChat.get(row.message.chatId) ?? [];
      list.push(row.messageId);
      byChat.set(row.message.chatId, list);
    }

    for (const [chatId, ids] of byChat) {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length > 0) {
        batches.push({ chatId, messageIds: uniqueIds, deliveredAt: now });
      }
    }

    if (pending.length < pageSize) {
      break;
    }
    if (Date.now() - startedAt >= budgetMs) {
      hasMore = true;
      break;
    }
  }

  return { batches, hasMore };
}

export async function markMessagesRead(userId: string, chatId: string, messageIds: string[]) {
  const prisma = getPrisma();
  const shareReadReceipts = await userSharesReadReceipts(prisma, userId);
  if (messageIds.length === 0) {
    return {
      chatId,
      messageIds: [] as string[],
      readAt: null as Date | null,
      shareReadReceipts,
    };
  }
  await requireActiveMember(userId, chatId);
  const unique = [...new Set(messageIds)];
  const n = await prisma.message.count({
    where: { chatId, id: { in: unique }, deletedAt: null },
  });
  if (n !== unique.length) {
    throw new AppError(400, "INVALID_MESSAGES", "Some messages are not in this chat");
  }
  const now = new Date();
  const result = await prisma.receipt.updateMany({
    where: {
      userId,
      messageId: { in: unique },
      readAt: null,
    },
    data: { readAt: now, deliveredAt: now },
  });
  if (result.count === 0) {
    return { chatId, messageIds: [] as string[], readAt: null as Date | null, shareReadReceipts };
  }
  return { chatId, messageIds: unique, readAt: now, shareReadReceipts };
}

export async function getChatUnreadBoundary(userId: string, chatId: string) {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const rows = await prisma.receipt.findMany({
    where: {
      userId,
      readAt: null,
      message: { chatId, deletedAt: null, ...MAIN_FEED_MESSAGE_WHERE },
    },
    orderBy: { message: { createdAt: "asc" } },
    select: { messageId: true },
    take: 2000,
  });
  if (rows.length === 0) {
    return {
      count: 0,
      firstMessageId: null as string | null,
      messageIds: [] as string[],
    };
  }
  const messageIds = rows.map((r) => r.messageId);
  return { count: messageIds.length, firstMessageId: messageIds.at(0) ?? null, messageIds };
}

/** Mark unread thread-only replies for a thread (opening thread panel). */
export async function markThreadAsRead(userId: string, chatId: string, threadRootId: string) {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const rows = await prisma.receipt.findMany({
    where: {
      userId,
      readAt: null,
      message: {
        chatId,
        deletedAt: null,
        threadRootId,
        NOT: { broadcastToChannel: true },
      },
    },
    select: { messageId: true },
  });
  const messageIds = rows.map((r) => r.messageId);
  if (messageIds.length === 0) {
    const unread = await getChatUnreadBoundary(userId, chatId);
    return {
      chatId,
      messageIds: [] as string[],
      readAt: null as Date | null,
      shareReadReceipts: await userSharesReadReceipts(prisma, userId),
      unread,
    };
  }
  const marked = await markMessagesRead(userId, chatId, messageIds);
  const unread = await getChatUnreadBoundary(userId, chatId);
  return { ...marked, unread };
}

/** Mark every unread receipt in a chat for this member (used when opening a conversation). */
export async function markChatAsRead(userId: string, chatId: string) {
  await requireActiveMember(userId, chatId);
  const prisma = getPrisma();
  const shareReadReceipts = await userSharesReadReceipts(prisma, userId);
  const unread = await prisma.receipt.findMany({
    where: {
      userId,
      readAt: null,
      message: { chatId },
    },
    select: { messageId: true },
  });
  const messageIds = [...new Set(unread.map((r) => r.messageId))];
  if (messageIds.length === 0) {
    return { chatId, messageIds: [] as string[], readAt: null as Date | null, shareReadReceipts };
  }
  const now = new Date();
  await prisma.receipt.updateMany({
    where: {
      userId,
      readAt: null,
      message: { chatId },
    },
    data: { readAt: now, deliveredAt: now },
  });
  return { chatId, messageIds, readAt: now, shareReadReceipts };
}

export async function getLatestMessageInChat(chatId: string) {
  const prisma = getPrisma();
  return prisma.message.findFirst({
    where: { chatId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export type ChatSyncHint = {
  chatId: string;
  hasGap: boolean;
  /** Use with REST `GET /chats/:id/messages?cursor=` when paginating older than latest. */
  latestCursor: string | null;
  latestMessageId: string | null;
};

export async function syncHelloForChats(
  userId: string,
  chats: { chatId: string; lastMessageId?: string | null }[],
): Promise<ChatSyncHint[]> {
  const out: ChatSyncHint[] = [];
  for (const row of chats) {
    await requireActiveMember(userId, row.chatId);
    const latest = await getLatestMessageInChat(row.chatId);
    const latestId = latest?.id ?? null;
    const latestCursor = latest ? encodeMessageCursor(latest.createdAt, latest.id) : null;
    const clientId = row.lastMessageId ?? null;
    const hasGap =
      latestId !== null && (clientId === null || clientId === undefined || clientId !== latestId);
    out.push({
      chatId: row.chatId,
      hasGap,
      latestCursor,
      latestMessageId: latestId,
    });
  }
  return out;
}

const lastSeenWriteAt = new Map<string, number>();
const LAST_SEEN_MIN_INTERVAL_MS = 60_000;

export async function touchUserLastSeen(userId: string) {
  const now = Date.now();
  const prev = lastSeenWriteAt.get(userId) ?? 0;
  if (now - prev < LAST_SEEN_MIN_INTERVAL_MS) {
    return;
  }
  lastSeenWriteAt.set(userId, now);
  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() },
  });
}

export async function setUserOnline(userId: string) {
  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: userId },
    data: { isOnline: true, lastSeenAt: new Date() },
  });
  lastSeenWriteAt.set(userId, Date.now());
}

export async function setUserOffline(userId: string) {
  const prisma = getPrisma();
  await prisma.user.update({
    where: { id: userId },
    data: { isOnline: false, lastSeenAt: new Date() },
  });
}

export async function getSharedChatMemberIds(userId: string): Promise<string[]> {
  const prisma = getPrisma();
  const userChats = await prisma.chatMember.findMany({
    where: { userId, leftAt: null },
    select: { chatId: true },
  });
  const chatIds = userChats.map((c) => c.chatId);
  if (chatIds.length === 0) return [];
  const sharedMembers = await prisma.chatMember.findMany({
    where: { chatId: { in: chatIds }, leftAt: null },
    select: { userId: true },
    distinct: ['userId'],
  });
  return sharedMembers.map((m) => m.userId).filter((id) => id !== userId);
}
