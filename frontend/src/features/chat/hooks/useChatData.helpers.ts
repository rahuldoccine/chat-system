import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '../types';
import { patchMessageInCache, removeMessageFromCache } from '../utils/messageCache';
import {
  mergeMessageIntoInfiniteCache,
  mergeMessageIntoThreadCache,
  patchMessageInThreadCache,
  removeMessageFromThreadCache,
  threadMessagesQueryKey,
  type MessagePage,
  type ThreadMessagesCache,
} from '../utils/messageQueryCache';

export function normalizeEditedAt(editedAt: unknown): string {
  if (editedAt == null) return new Date().toISOString();
  if (typeof editedAt === 'string') return editedAt;
  return new Date(editedAt as string | number | Date).toISOString();
}

export function resolvePreferPeerDeviceId(
  _queryClient: QueryClient,
  _chatId: string,
  _peerUserId: string | undefined,
): string | null {
  return null;
}

type OptimisticCacheInput = {
  chatId: string;
  threadRootId?: string | null;
  broadcastToChannel?: boolean;
  optimistic: Message;
};

export function applyOptimisticMessageToCaches(
  queryClient: QueryClient,
  input: OptimisticCacheInput,
): void {
  const { chatId, threadRootId, broadcastToChannel, optimistic } = input;

  if (threadRootId) {
    queryClient.setQueryData<ThreadMessagesCache>(
      threadMessagesQueryKey(chatId, threadRootId),
      (old) => (old ? mergeMessageIntoThreadCache(old, optimistic) : old),
    );
    if (broadcastToChannel) {
      queryClient.setQueryData(['messages', chatId], (old) =>
        mergeMessageIntoInfiniteCache(
          old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
          optimistic,
        ) ?? old,
      );
    }
    return;
  }

  queryClient.setQueryData(['messages', chatId], (old) =>
    mergeMessageIntoInfiniteCache(
      old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
      optimistic,
    ) ?? old,
  );
}

type FinalizedMessageCacheInput = {
  chatId: string;
  threadRootId?: string | null;
  broadcastToChannel?: boolean;
  message: Message;
  clientMessageId: string;
  queued: boolean;
};

export function applyFinalizedMessageToCaches(
  queryClient: QueryClient,
  input: FinalizedMessageCacheInput,
): void {
  const { chatId, threadRootId, broadcastToChannel, message, clientMessageId, queued } = input;
  const finalized = {
    ...message,
    clientMessageId,
    receiptStatus: 'sent' as const,
    status: queued ? ('sending' as const) : undefined,
  };

  if (threadRootId) {
    queryClient.setQueryData<ThreadMessagesCache>(
      threadMessagesQueryKey(chatId, threadRootId),
      (old) => (old ? mergeMessageIntoThreadCache(old, finalized) : old),
    );
    if (broadcastToChannel) {
      queryClient.setQueryData(['messages', chatId], (old) =>
        mergeMessageIntoInfiniteCache(
          old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
          finalized,
        ) ?? old,
      );
    }
    return;
  }

  queryClient.setQueryData(['messages', chatId], (old) =>
    mergeMessageIntoInfiniteCache(
      old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
      finalized,
    ) ?? old,
  );
}

export function markSendingMessagesAsError(
  queryClient: QueryClient,
  chatId: string,
  userId: string,
): void {
  queryClient.setQueryData(['messages', chatId], (old) => {
    const pages = old as { pages: MessagePage[] } | undefined;
    if (!pages?.pages?.length) return old;
    return {
      ...pages,
      pages: pages.pages.map((page: MessagePage) => ({
        ...page,
        data: page.data.map((m: Message) =>
          m.status === 'sending' && m.senderId === userId
            ? { ...m, status: 'error' as const }
            : m,
        ),
      })),
    };
  });
}

export function patchEditedMessageInCaches(
  queryClient: QueryClient,
  chatId: string,
  messageId: string,
  patch: { ciphertext: string; editedAt: string; contentMeta: Message['contentMeta'] },
  threadRootId: string | null | undefined,
): void {
  queryClient.setQueryData(['messages', chatId], (old: unknown) =>
    patchMessageInCache(old as Parameters<typeof patchMessageInCache>[0], messageId, patch),
  );
  if (threadRootId) {
    queryClient.setQueryData<ThreadMessagesCache>(
      threadMessagesQueryKey(chatId, threadRootId),
      (old) => patchMessageInThreadCache(old, messageId, patch),
    );
  }
}

export function removeMessageFromAllCaches(
  queryClient: QueryClient,
  chatId: string,
  messageId: string,
): void {
  queryClient.setQueryData(['messages', chatId], (old: unknown) =>
    removeMessageFromCache(old as Parameters<typeof removeMessageFromCache>[0], messageId),
  );
  queryClient.setQueriesData<ThreadMessagesCache>(
    { queryKey: ['threadMessages', chatId] },
    (old) => removeMessageFromThreadCache(old, messageId),
  );
}
