import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Message } from '../types';
import { enrichMessageWithReply } from './messageReply';

export type MessagePage = { data: Message[]; nextCursor: string | null };

export type ThreadMessagesCache = {
  root: Message;
  replies: Message[];
};

/** Top-level DM timeline: roots and cross-posted thread replies only. */
export function shouldShowInMainFeed(message: Message): boolean {
  return !message.threadRootId || Boolean(message.broadcastToChannel);
}

export function threadMessagesQueryKey(chatId: string, rootMessageId: string) {
  return ['threadMessages', chatId, rootMessageId] as const;
}

/** Chronological message list from infinite-query pages (newest page first in `pages`). */
export function flattenMessagePages(pages: MessagePage[] | undefined): Message[] | undefined {
  if (!pages?.length) return undefined;
  return pages.flatMap((page) => page.data).reverse();
}

const RECEIPT_RANK: Record<NonNullable<Message['receiptStatus']>, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
};

function maxReceiptDisplay(
  a: Message['receiptStatus'] | undefined,
  b: Message['receiptStatus'] | undefined,
): Message['receiptStatus'] | undefined {
  const aa = a ?? 'sent';
  const bb = b ?? 'sent';
  return RECEIPT_RANK[bb] > RECEIPT_RANK[aa] ? bb : aa;
}

function isSameMessageRow(existing: Message, incoming: Message): boolean {
  if (existing.id === incoming.id) return true;
  const incClient = incoming.clientMessageId;
  if (incClient && (existing.id === incClient || existing.clientMessageId === incClient)) {
    return true;
  }
  const exClient = existing.clientMessageId;
  if (exClient && incoming.id === exClient) return true;
  return false;
}

export function mergeMessageIntoThreadCache(
  old: ThreadMessagesCache | undefined,
  message: Message,
): ThreadMessagesCache | undefined {
  if (!old) return old;
  const replies = [...old.replies];
  const idx = replies.findIndex((m) => isSameMessageRow(m, message));
  if (idx >= 0) {
    replies[idx] = { ...replies[idx], ...message, id: message.id };
  } else {
    replies.push(message);
    replies.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }
  return { ...old, replies };
}

/** Keep attachment manifest from optimistic row when server E2EE meta replaces it. */
function mergeMessageContentMeta(
  existing: Message['contentMeta'],
  incoming: Message['contentMeta'],
): Message['contentMeta'] {
  const prev = (existing ?? {}) as Record<string, unknown>;
  const next = (incoming ?? {}) as Record<string, unknown>;
  const prevFiles = prev.files;
  const nextFiles = next.files;
  const files =
    Array.isArray(nextFiles) && nextFiles.length
      ? nextFiles
      : Array.isArray(prevFiles) && prevFiles.length
        ? prevFiles
        : undefined;
  return {
    ...prev,
    ...next,
    ...(files ? { files } : {}),
  } as Message['contentMeta'];
}

export function mergeMessageIntoInfiniteCache(
  old: InfiniteData<MessagePage> | undefined,
  message: Message,
): InfiniteData<MessagePage> | undefined {
  if (!shouldShowInMainFeed(message)) return old;
  if (!old?.pages?.length) return old;

  const flat = old.pages.flatMap((p) => p.data);
  const matchIdx = flat.findIndex((m) => isSameMessageRow(m, message));
  if (matchIdx >= 0) {
    const pages = old.pages.map((page) => ({
      ...page,
      data: page.data.map((m) =>
        isSameMessageRow(m, message)
          ? {
              ...m,
              ...message,
              id: message.id,
              clientMessageId: message.clientMessageId ?? m.clientMessageId,
              senderId: message.senderId ?? m.senderId,
              sender: message.sender ?? m.sender,
              ciphertext: message.ciphertext ?? m.ciphertext,
              contentMeta: mergeMessageContentMeta(m.contentMeta, message.contentMeta),
              status: undefined,
              receiptStatus: maxReceiptDisplay(m.receiptStatus, message.receiptStatus),
            }
          : m,
      ),
    }));
    return { ...old, pages };
  }

  const enriched = enrichMessageWithReply(message, flat);
  const pages = [...old.pages];
  pages[0] = {
    ...pages[0],
    data: [enriched, ...pages[0].data],
  };
  return { ...old, pages };
}

export function patchMessageStatusInCache(
  old: InfiniteData<MessagePage> | undefined,
  clientMessageId: string,
  status: Message['status'],
): InfiniteData<MessagePage> | undefined {
  if (!old?.pages?.length) return old;
  const pages = old.pages.map((page) => ({
    ...page,
    data: page.data.map((m) =>
      m.id === clientMessageId || m.clientMessageId === clientMessageId
        ? { ...m, status, ...(status === undefined ? { status: undefined } : {}) }
        : m,
    ),
  }));
  return { ...old, pages };
}

export function areMessageIdsLoaded(
  messages: Message[] | undefined,
  ids: Iterable<string>,
): boolean {
  if (!messages?.length) return false;
  const loaded = new Set(messages.map((m) => m.id));
  for (const id of ids) {
    if (!loaded.has(id)) return false;
  }
  return true;
}

export function applyIncomingMessageToAllCaches(
  queryClient: QueryClient,
  message: Message,
): void {
  if (message.threadRootId) {
    queryClient.setQueryData<ThreadMessagesCache>(
      threadMessagesQueryKey(message.chatId, message.threadRootId),
      (old) => (old ? mergeMessageIntoThreadCache(old, message) : old),
    );
    if (shouldShowInMainFeed(message)) {
      queryClient.setQueryData(['messages', message.chatId], (old) =>
        mergeMessageIntoInfiniteCache(
          old as InfiniteData<MessagePage> | undefined,
          message,
        ) ?? old,
      );
    }
  } else {
    queryClient.setQueryData(['messages', message.chatId], (old) =>
      mergeMessageIntoInfiniteCache(
        old as InfiniteData<MessagePage> | undefined,
        message,
      ) ?? old,
    );
  }
}

export function applyThreadUpdatedToMainCache(
  queryClient: QueryClient,
  data: {
    chatId: string;
    rootMessageId: string;
    replyCount: number;
    lastReplyAt: string;
  },
): void {
  queryClient.setQueryData(['messages', data.chatId], (old) => {
    if (!old) return old;
    const pages = (old as InfiniteData<MessagePage>).pages.map((page) => ({
      ...page,
      data: page.data.map((m) =>
        m.id === data.rootMessageId
          ? {
              ...m,
              threadReplyCount: data.replyCount,
              threadLastReplyAt: data.lastReplyAt,
            }
          : m,
      ),
    }));
    return { ...(old as InfiniteData<MessagePage>), pages };
  });
}
