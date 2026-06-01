import type { QueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { socketService } from '../../services/socket';
import type { Chat } from '../chat/types';
import {
  flattenMessagePages,
  mergeMessageIntoInfiniteCache,
  type MessagePage,
} from '../chat/hooks/useChatData';
import { listPendingOutbox } from './outbox';
import { deliverOutboxEntry, type SendMessageResult } from './sendMessage';

type SyncHelloHint = {
  chatId: string;
  hasGap: boolean;
  latestCursor: string | null;
  latestMessageId: string | null;
};

type SyncHelloAck =
  | { ok: true; data?: { chats: SyncHelloHint[] } }
  | { ok: false; message?: string };

function emitSyncHello(
  chats: { chatId: string; lastMessageId?: string | null }[],
): Promise<SyncHelloHint[]> {
  return new Promise((resolve) => {
    if (!socketService.isConnected()) {
      resolve([]);
      return;
    }
    const timer = globalThis.setTimeout(() => resolve([]), 12_000);
    socketService.emit('sync:hello', { chats }, (ack: SyncHelloAck) => {
      globalThis.clearTimeout(timer);
      if (ack?.ok && ack.data?.chats) resolve(ack.data.chats);
      else resolve([]);
    });
  });
}

function getLastMessageIdForChat(queryClient: QueryClient, chatId: string): string | null {
  const pages = queryClient.getQueryData<{ pages: MessagePage[] }>(['messages', chatId]);
  const flat = flattenMessagePages(pages?.pages);
  if (!flat?.length) return null;
  const serverRows = flat.filter((m) => m.id && m.status !== 'sending' && m.status !== 'error');
  if (!serverRows.length) return null;
  return serverRows.at(-1)?.id ?? null;
}

async function fetchLatestMessages(chatId: string, cursor: string | null) {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const res = await api.get<MessagePage>(`/chats/${chatId}/messages`, { params });
  return res.data;
}

function applyFlushResult(queryClient: QueryClient, result: SendMessageResult) {
  const { message, clientMessageId } = result;
  queryClient.setQueryData(['messages', message.chatId], (old) =>
    mergeMessageIntoInfiniteCache(
      old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
      { ...message, clientMessageId: message.clientMessageId ?? clientMessageId, status: undefined },
    ) ?? old,
  );
  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
}

async function flushOutboxWithCache(queryClient: QueryClient) {
  const pending = await listPendingOutbox();
  for (const entry of pending) {
    const result = await deliverOutboxEntry(entry);
    if (result) applyFlushResult(queryClient, result);
  }
}

/** Reconnect: flush pending sends, then sync gaps via sync:hello. */
export async function syncOnReconnect(queryClient: QueryClient, activeChatId: string | null) {
  await flushOutboxWithCache(queryClient);

  const conv = queryClient.getQueryData<{ data?: Chat[] }>(['conversations']);
  const chatIds = new Set<string>();
  for (const c of conv?.data ?? []) chatIds.add(c.id);
  if (activeChatId) chatIds.add(activeChatId);

  if (chatIds.size === 0) return;

  const chats = [...chatIds].slice(0, 50).map((chatId) => ({
    chatId,
    lastMessageId: getLastMessageIdForChat(queryClient, chatId),
  }));

  const hints = await emitSyncHello(chats);
  const gaps = hints.filter((h) => h.hasGap && h.latestCursor);
  await Promise.all(
    gaps.map(async (hint) => {
      try {
        const page = await fetchLatestMessages(hint.chatId, hint.latestCursor);
        if (!page?.data?.length) return;
        for (const msg of [...page.data].reverse()) {
          queryClient.setQueryData(['messages', hint.chatId], (old) =>
            mergeMessageIntoInfiniteCache(
              old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
              msg,
            ) ?? old,
          );
        }
      } catch {
        void queryClient.invalidateQueries({ queryKey: ['messages', hint.chatId] });
      }
    }),
  );

  if (gaps.length > 0) {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }
}
