import type { QueryClient } from '@tanstack/react-query';
import api from '../../../api/axios';
import type { Message } from '../types';
import { socketService } from '../../../services/socket';
import type { ChatUnreadBoundary } from '../hooks/useChatData';
import { patchConversationUnreadCount } from './conversationCache';
import { buildUnreadState } from './incrementalRead';
import { broadcastReadState } from '../../sync/tabCoordinator';

const RECEIPT_BATCH_SIZE = 200;

type SocketAck =
  | { ok: true; data?: unknown }
  | { ok: false; code?: string; message?: string };

function emitWithAck<T = unknown>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = socketService.getSocket();
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    const timer = window.setTimeout(() => {
      reject(new Error(`Socket ${event} timed out`));
    }, timeoutMs);

    socket.emit(event, payload, (response: SocketAck) => {
      window.clearTimeout(timer);
      if (response?.ok) {
        resolve((response.data ?? response) as T);
        return;
      }
      reject(new Error(response?.message ?? `Socket ${event} failed`));
    });
  });
}

/** Mark every unread receipt in this chat (HTTP first - reliable; socket as fallback). */
export async function markChatAsRead(chatId: string): Promise<void> {
  try {
    await api.post(`/chats/${chatId}/read`);
    broadcastReadState(chatId);
    return;
  } catch {
    await emitWithAck('receipt:read_chat', { chatId });
    broadcastReadState(chatId);
  }
}

export async function markChatAsReadWithRetry(
  chatId: string,
  maxAttempts = 4,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await markChatAsRead(chatId);
      return true;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => window.setTimeout(r, 350 * (attempt + 1)));
      }
    }
  }
  return false;
}

export function applyChatReadToCaches(queryClient: QueryClient, chatId: string) {
  applyUnreadStateToCaches(queryClient, chatId, buildUnreadState([]));
}

export function applyUnreadStateToCaches(
  queryClient: QueryClient,
  chatId: string,
  unread: ChatUnreadBoundary,
) {
  queryClient.setQueryData(['conversations'], (old) =>
    patchConversationUnreadCount(
      old as Parameters<typeof patchConversationUnreadCount>[0],
      chatId,
      unread.count,
    ),
  );
  queryClient.setQueryData(['chatUnread', chatId], unread);
}

type MarkMessagesReadResponse = {
  messageIds: string[];
  unread: ChatUnreadBoundary;
};

/** Mark specific messages as read (incremental scroll-to-read). */
export async function markMessagesAsRead(
  chatId: string,
  messageIds: string[],
): Promise<MarkMessagesReadResponse | null> {
  if (messageIds.length === 0) return null;
  try {
    const response = await api.post<MarkMessagesReadResponse>(`/chats/${chatId}/read/messages`, {
      messageIds,
    });
    return response.data;
  } catch {
    try {
      await emitWithAck<MarkMessagesReadResponse>('receipt:read', { chatId, messageIds });
      return null;
    } catch {
      return null;
    }
  }
}

const BOTTOM_THRESHOLD_PX = 120;

/** True when the scroll container is at the bottom (all latest content seen). */
export function isChatScrolledToBottom(container: HTMLElement | null): boolean {
  if (!container) return false;
  const gap = container.scrollHeight - container.scrollTop - container.clientHeight;
  return gap < BOTTOM_THRESHOLD_PX;
}

/** True when the latest message row is visible in the chat viewport. */
export function isLastMessageVisible(
  container: HTMLElement | null,
  lastMessageId: string | null | undefined,
): boolean {
  if (!container || !lastMessageId) return false;
  const el = document.getElementById(`msg-${lastMessageId}`);
  if (!el) return false;
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  return eRect.top < cRect.bottom && eRect.bottom <= cRect.bottom + 8;
}

/** Mark read when caught up: at bottom OR the latest message is on screen (e.g. single new DM). */
export function shouldMarkChatAsRead(
  container: HTMLElement | null,
  lastMessageId: string | null | undefined,
): boolean {
  return isChatScrolledToBottom(container) || isLastMessageVisible(container, lastMessageId);
}

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export async function ackIncomingMessages(chatId: string, messages: Message[], viewerId: string) {
  const incomingIds = messages
    .filter((m) => m.senderId !== viewerId && !m.deletedAt)
    .map((m) => m.id);
  if (incomingIds.length === 0) return;

  const chunks = chunkIds(incomingIds, RECEIPT_BATCH_SIZE);
  for (const messageIds of chunks) {
    try {
      await api.post(`/chats/${chatId}/delivered/messages`, { messageIds });
    } catch {
      try {
        await emitWithAck('receipt:delivered', { chatId, messageIds });
      } catch {
        /* Delivered ack is best-effort */
      }
    }
  }
}

const RECEIPT_RANK: Record<NonNullable<Message['receiptStatus']>, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
};

function mergeReceiptStatus(
  current: Message['receiptStatus'] | undefined,
  next: NonNullable<Message['receiptStatus']>,
): Message['receiptStatus'] {
  if (!current) return next;
  return RECEIPT_RANK[next] > RECEIPT_RANK[current] ? next : current;
}

export type PatchReceiptStatusResult = {
  data: { pages: Array<{ data: Message[] }> } | undefined;
  /** Rows that matched id + sender (cache had the message for this receipt). */
  matchedCount: number;
};

export function patchReceiptStatusInCache(
  old: { pages: Array<{ data: Message[] }> } | undefined,
  _chatId: string,
  messageIds: string[],
  status: 'delivered' | 'read',
  senderId: string,
): PatchReceiptStatusResult {
  if (!old) {
    return { data: old, matchedCount: 0 };
  }
  const idSet = new Set(messageIds);
  let matchedCount = 0;
  const next = {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      data: page.data.map((m) => {
        const rowSender = m.senderId || m.sender?.id;
        if (!idSet.has(m.id) || rowSender !== senderId) return m;
        matchedCount += 1;
        return { ...m, receiptStatus: mergeReceiptStatus(m.receiptStatus, status) };
      }),
    })),
  };
  return { data: next, matchedCount };
}
