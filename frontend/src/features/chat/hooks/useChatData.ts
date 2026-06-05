import { useMemo } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  keepPreviousData,
} from '@tanstack/react-query';
import api from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import type { Chat, Message, PollDetail } from '../types';
import { patchReactionOnMessage } from '../utils/messageReactions';
import {
  flattenMessagePages,
  mergeMessageIntoInfiniteCache,
  threadMessagesQueryKey,
  type MessagePage,
} from '../utils/messageQueryCache';
import { flushOutbox, sendMessageUnified } from '../../sync/sendMessage';
import { canAttemptDelivery as canAttemptDeliveryAsync } from '../../sync/connectivity';
import { buildOptimisticMessage } from '../../sync/optimisticMessage';
import {
  applyFinalizedMessageToCaches,
  applyOptimisticMessageToCaches,
  markSendingMessagesAsError,
  normalizeEditedAt,
  patchEditedMessageInCaches,
  removeMessageFromAllCaches,
  resolvePreferPeerDeviceId,
} from './useChatData.helpers';

function useAuthApiGet<T>(
  queryKey: unknown[],
  path: string,
  enabled: boolean,
  options?: { params?: Record<string, string | number>; refetchOnMount?: 'always' },
) {
  return useQuery<T>({
    queryKey,
    queryFn: async () => {
      const response = await api.get(path, options?.params ? { params: options.params } : undefined);
      return response.data as T;
    },
    enabled,
    staleTime: 0,
    ...(options?.refetchOnMount ? { refetchOnMount: options.refetchOnMount } : {}),
  });
}

export const useConversations = () => {
  const { isAuthenticated } = useAuth();
  return useAuthApiGet<{ data: Chat[]; nextCursor: string | null }>(
    ['conversations'],
    '/chats',
    isAuthenticated,
    { refetchOnMount: 'always' },
  );
};

export type DiscoverableUser = {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export const useSearchUsers = (query: string, enabled = true) => {
  return useAuthApiGet<{ data: DiscoverableUser[] }>(
    ['users', 'search', query],
    '/users/search',
    enabled,
    { params: { q: query, limit: 30 }, refetchOnMount: 'always' },
  );
};

export const useCreateDirectChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const response = await api.post('/chats', { type: 'DIRECT', otherUserId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'search'] });
    },
  });
};

export const useMessages = (chatId: string | null) => {
  const query = useInfiniteQuery({
    queryKey: ['messages', chatId],
    queryFn: async ({ pageParam }) => {
      if (!chatId) return { data: [], nextCursor: null };
      const response = await api.get(`/chats/${chatId}/messages`, {
        params: { cursor: pageParam },
      });
      return response.data as MessagePage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: !!chatId,
    refetchOnMount: true,
  });

  const messages = useMemo(
    () => flattenMessagePages(query.data?.pages),
    [query.data?.pages],
  );

  return { ...query, data: messages };
};

export const useThreadMessages = (chatId: string | null, rootMessageId: string | null) => {
  return useQuery({
    queryKey: threadMessagesQueryKey(chatId ?? '', rootMessageId ?? ''),
    queryFn: async () => {
      if (!chatId || !rootMessageId) {
        return { root: null, replies: [] } as { root: Message | null; replies: Message[] };
      }
      const replies: Message[] = [];
      let cursor: string | undefined;
      let root: Message | null = null;
      do {
        const response = await api.get(`/chats/${chatId}/threads/${rootMessageId}/messages`, {
          params: { limit: 50, cursor },
        });
        const page = response.data as {
          root: Message;
          data: Message[];
          nextCursor: string | null;
        };
        root = page.root;
        replies.push(...page.data);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return { root, replies };
    },
    enabled: Boolean(chatId && rootMessageId),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
};

export {
  mergeMessageIntoInfiniteCache,
  flattenMessagePages,
  type MessagePage,
  type ThreadMessagesCache,
} from '../utils/messageQueryCache';

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      chatId,
      text,
      replyToId,
      threadRootId,
      broadcastToChannel,
      kind = 'TEXT',
      contentMeta,
      chat,
      peerUserId,
      groupMemberIds,
    }: {
      chatId: string;
      text?: string;
      replyToId?: string;
      threadRootId?: string | null;
      broadcastToChannel?: boolean;
      kind?: 'TEXT' | 'IMAGE' | 'FILE' | 'OTHER';
      contentMeta?: unknown;
      chat?: Chat | null;
      peerUserId?: string;
      groupMemberIds?: string[];
    }) => {
      const clientMessageId = crypto.randomUUID();
      const preferPeerDeviceId = resolvePreferPeerDeviceId(queryClient, chatId, peerUserId);

      if (user) {
        const optimistic = buildOptimisticMessage(
          { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
          {
            clientMessageId,
            chatId,
            text,
            replyToId,
            threadRootId,
            broadcastToChannel,
            kind,
            contentMeta: contentMeta as Message['contentMeta'],
          },
        );
        applyOptimisticMessageToCaches(queryClient, {
          chatId,
          threadRootId,
          broadcastToChannel,
          optimistic,
        });
      }

      const result = await sendMessageUnified({
        chatId,
        text,
        replyToId,
        threadRootId,
        broadcastToChannel,
        kind,
        contentMeta,
        clientMessageId,
        userId: user?.id,
        chat: chat ?? undefined,
        peerUserId,
        groupMemberIds,
        preferPeerDeviceId,
      });

      return { ...result, chatId, clientMessageId };
    },
    onSuccess: (data, variables) => {
      const threadRootId = variables.threadRootId ?? data.message.threadRootId;

      applyFinalizedMessageToCaches(queryClient, {
        chatId: data.chatId,
        threadRootId,
        broadcastToChannel: variables.broadcastToChannel ?? data.message.broadcastToChannel,
        message: data.message,
        clientMessageId: data.clientMessageId,
        queued: data.queued,
      });

      if (data.queued) {
        void canAttemptDeliveryAsync().then((ok) => {
          if (ok) void flushOutbox();
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (_err, variables) => {
      if (!user?.id) return;
      markSendingMessagesAsError(queryClient, variables.chatId, user.id);
    },
  });
};

export const useCreatePoll = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      chatId: string;
      question: string;
      closesAt?: string | null;
      options: string[];
    }) => {
      const response = await api.post<{
        poll: PollDetail;
        message: Message;
      }>(`/chats/${input.chatId}/polls`, {
        question: input.question,
        closesAt: input.closesAt ?? null,
        options: input.options,
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['messages', data.message.chatId], (old) => {
        const merged = mergeMessageIntoInfiniteCache(old as Parameters<typeof mergeMessageIntoInfiniteCache>[0], {
          ...data.message,
          receiptStatus: 'sent' as const,
        });
        return merged ?? old;
      });
      queryClient.setQueryData(['poll', data.poll.id], data.poll);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

export const useEditMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      text,
    }: {
      chatId: string;
      messageId: string;
      text: string;
      chat?: Chat | null;
      peerUserId?: string;
    }) => {
      const response = await api.patch(`/messages/${messageId}`, {
        ciphertext: text,
      });
      return response.data as { message: Message };
    },
    onSuccess: (data, { chatId, messageId }) => {
      const updated = data?.message;
      if (!updated) return;
      const editedAt = normalizeEditedAt(updated.editedAt);

      patchEditedMessageInCaches(
        queryClient,
        chatId,
        messageId,
        {
          ciphertext: updated.ciphertext ?? '',
          editedAt,
          contentMeta: updated.contentMeta,
        },
        updated.threadRootId,
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

export const useDeleteMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId }: { chatId: string; messageId: string }) => {
      await api.delete(`/messages/${messageId}`);
      return { messageId };
    },
    onSuccess: (_data, { chatId, messageId }) => {
      removeMessageFromAllCaches(queryClient, chatId, messageId);
      queryClient.invalidateQueries({ queryKey: ['pins', chatId] });
    },
  });
};

export type PinnedMessageEntry = {
  messageId: string;
  pinnedById: string;
  createdAt: string;
  pinnedBy?: {
    id: string;
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    username?: string | null;
  };
  message?: Message;
};

export type ChatUnreadBoundary = {
  count: number;
  firstMessageId: string | null;
  messageIds?: string[];
};

function useChatScopedGetQuery<T>(
  chatId: string | null,
  queryKey: string,
  pathSuffix: string,
  options?: { refetchOnMount?: 'always' },
) {
  return useQuery<T>({
    queryKey: [queryKey, chatId],
    queryFn: async () => {
      const response = await api.get(`/chats/${chatId}${pathSuffix}`);
      return response.data as T;
    },
    enabled: !!chatId,
    staleTime: 0,
    ...(options?.refetchOnMount ? { refetchOnMount: options.refetchOnMount } : {}),
  });
}

export const useChatUnreadBoundary = (chatId: string | null) =>
  useChatScopedGetQuery<ChatUnreadBoundary>(chatId, 'chatUnread', '/unread', {
    refetchOnMount: 'always',
  });

export const usePinnedMessages = (chatId: string | null) =>
  useChatScopedGetQuery<{ data: PinnedMessageEntry[] }>(chatId, 'pins', '/pins');

function useInvalidatePinsOnSuccess() {
  const queryClient = useQueryClient();
  return (chatId: string) => {
    queryClient.invalidateQueries({ queryKey: ['pins', chatId] });
  };
}

function usePinMutation(method: 'post' | 'delete') {
  const invalidatePins = useInvalidatePinsOnSuccess();
  return useMutation({
    mutationFn: async ({ messageId }: { chatId: string; messageId: string }) => {
      if (method === 'post') {
        const response = await api.post(`/messages/${messageId}/pin`);
        return response.data as { chatId: string; messageId: string };
      }
      await api.delete(`/messages/${messageId}/pin`);
      return { messageId };
    },
    onSuccess: (_data, { chatId }) => {
      invalidatePins(chatId);
    },
  });
}

export const usePinMessage = () => usePinMutation('post');
export const useUnpinMessage = () => usePinMutation('delete');

function useReactionMutation(mode: 'add' | 'remove') {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { chatId: string; messageId: string; emoji: string }) => {
      if (mode === 'add') {
        const response = await api.post(`/messages/${messageId}/reactions`, { emoji });
        return response.data as { chatId: string; messageId: string; emoji: string };
      }
      await api.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
      return { messageId, emoji };
    },
    onMutate: async ({ chatId, messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previous = queryClient.getQueryData(['messages', chatId]);
      queryClient.setQueryData(['messages', chatId], (old: any) =>
        patchReactionOnMessage(old, messageId, emoji, mode, userId, userId),
      );
      return { previous, chatId };
    },
    onError: (_err, { chatId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['messages', chatId], context.previous);
      }
    },
  });
}

export const useAddReaction = () => useReactionMutation('add');
export const useRemoveReaction = () => useReactionMutation('remove');
