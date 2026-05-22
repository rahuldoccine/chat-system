import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import api from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import type { Chat, Message, PollDetail } from '../types';
import { patchReactionOnMessage } from '../utils/messageReactions';
import { patchMessageInCache, removeMessageFromCache } from '../utils/messageCache';
import {
  flattenMessagePages,
  mergeMessageIntoInfiniteCache,
  mergeMessageIntoThreadCache,
  threadMessagesQueryKey,
  type MessagePage,
  type ThreadMessagesCache,
} from '../utils/messageQueryCache';
import { flushOutbox, sendMessageUnified } from '../../sync/sendMessage';
import { canAttemptDelivery as canAttemptDeliveryAsync } from '../../sync/connectivity';
import { buildOptimisticMessage } from '../../sync/optimisticMessage';
import { linkSentMessageId, rememberSentPlaintext, rememberSentPayloadMeta } from '../../e2ee/sentPlaintextCache';
import { isDmE2eeChat } from '../../e2ee/chatE2ee';
import { prepareOutboundMessage, prepareOutboundPoll } from '../../e2ee/prepareOutbound';
import { latestPeerSenderDeviceId } from '../../e2ee/peerDevice';

export const useConversations = () => {
  const { isAuthenticated } = useAuth();

  return useQuery<{ data: Chat[], nextCursor: string | null }>({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await api.get('/chats');
      return response.data;
    },
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

export type DiscoverableUser = {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export const useSearchUsers = (query: string, enabled = true) => {
  return useQuery<{ data: DiscoverableUser[] }>({
    queryKey: ['users', 'search', query],
    queryFn: async () => {
      const response = await api.get('/users/search', {
        params: { q: query, limit: 30 },
      });
      return response.data;
    },
    enabled,
  });
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
  });
};

export { mergeMessageIntoInfiniteCache, flattenMessagePages, type MessagePage, type ThreadMessagesCache };

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
      preEncrypted,
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
      preEncrypted?: { ciphertext: string; contentMeta: unknown };
    }) => {
      const clientMessageId = crypto.randomUUID();

      let preferPeerDeviceId: string | null = null;
      if (peerUserId) {
        const cached = queryClient.getQueryData<{ pages: MessagePage[] }>(['messages', chatId]);
        preferPeerDeviceId = latestPeerSenderDeviceId(
          flattenMessagePages(cached?.pages),
          peerUserId,
        );
      }

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
        } else {
          queryClient.setQueryData(['messages', chatId], (old) =>
            mergeMessageIntoInfiniteCache(
              old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
              optimistic,
            ) ?? old,
          );
        }
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
        preferPeerDeviceId,
        preEncrypted,
      });

      if (user?.id && !result.queued) {
        linkSentMessageId(user.id, clientMessageId, result.message.id);
      }

      return { ...result, chatId, clientMessageId };
    },
    onSuccess: (data, variables) => {
      const finalized = {
        ...data.message,
        clientMessageId: data.clientMessageId,
        receiptStatus: 'sent' as const,
        status: data.queued ? ('sending' as const) : undefined,
      };
      const threadRootId = variables.threadRootId ?? data.message.threadRootId;

      if (data.queued) {
        if (threadRootId) {
          queryClient.setQueryData<ThreadMessagesCache>(
            threadMessagesQueryKey(data.chatId, threadRootId),
            (old) => (old ? mergeMessageIntoThreadCache(old, finalized) : old),
          );
          if (variables.broadcastToChannel) {
            queryClient.setQueryData(['messages', data.chatId], (old) =>
              mergeMessageIntoInfiniteCache(
                old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
                finalized,
              ) ?? old,
            );
          }
        } else {
          queryClient.setQueryData(['messages', data.chatId], (old) =>
            mergeMessageIntoInfiniteCache(
              old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
              finalized,
            ) ?? old,
          );
        }
        void canAttemptDeliveryAsync().then((ok) => {
          if (ok) void flushOutbox();
        });
        return;
      }
      if (user?.id) {
        linkSentMessageId(user.id, data.clientMessageId, data.message.id);
      }
      if (threadRootId) {
        queryClient.setQueryData<ThreadMessagesCache>(
          threadMessagesQueryKey(data.message.chatId, threadRootId),
          (old) => (old ? mergeMessageIntoThreadCache(old, finalized) : old),
        );
        if (data.message.broadcastToChannel) {
          queryClient.setQueryData(['messages', data.message.chatId], (old) =>
            mergeMessageIntoInfiniteCache(
              old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
              finalized,
            ) ?? old,
          );
        }
      } else {
        queryClient.setQueryData(['messages', data.message.chatId], (old) =>
          mergeMessageIntoInfiniteCache(
            old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
            finalized,
          ) ?? old,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (_err, variables) => {
      if (!user?.id) return;
      queryClient.setQueryData(['messages', variables.chatId], (old) => {
        const pages = old as { pages: MessagePage[] } | undefined;
        if (!pages?.pages?.length) return old;
        return {
          ...pages,
          pages: pages.pages.map((page: MessagePage) => ({
            ...page,
            data: page.data.map((m: Message) =>
              m.status === 'sending' && m.senderId === user.id
                ? { ...m, status: 'error' as const }
                : m,
            ),
          })),
        };
      });
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
      userId?: string;
      chat?: import('../types').Chat | null;
      peerUserId?: string;
      clientMessageId?: string;
    }) => {
      if (isDmE2eeChat(input.chat ?? null) && input.userId) {
        const clientMessageId = input.clientMessageId ?? crypto.randomUUID();
        const cached = queryClient.getQueryData<{ pages: MessagePage[] }>([
          'messages',
          input.chatId,
        ]);
        const preferPeerDeviceId = input.peerUserId
          ? latestPeerSenderDeviceId(flattenMessagePages(cached?.pages), input.peerUserId)
          : null;
        const prepared = await prepareOutboundPoll(input.userId, {
          chat: input.chat,
          peerUserId: input.peerUserId,
          preferPeerDeviceId,
          question: input.question,
          closesAt: input.closesAt ?? null,
          options: input.options,
          clientMessageId,
        });
        const response = await api.post<{
          poll: PollDetail;
          message: Message;
        }>(`/chats/${input.chatId}/polls`, {
          question: input.question,
          closesAt: input.closesAt ?? null,
          options: input.options,
          ciphertext: prepared.ciphertext,
          contentMeta: prepared.contentMeta,
          clientMessageId,
        });
        return response.data;
      }

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
    onSuccess: (data, variables) => {
      if (variables.userId && variables.clientMessageId) {
        linkSentMessageId(variables.userId, variables.clientMessageId, data.message.id);
      }
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      messageId,
      text,
      chat,
      peerUserId,
    }: {
      chatId: string;
      messageId: string;
      text: string;
      chat?: Chat | null;
      peerUserId?: string;
    }) => {
      let ciphertext = text;
      let contentMeta: unknown = undefined;
      if (user?.id) {
        const prepared = await prepareOutboundMessage(user.id, {
          chatId: chat?.id ?? '',
          text,
          chat,
          peerUserId,
        });
        ciphertext = prepared.ciphertext;
        contentMeta = prepared.contentMeta;
      }
      const response = await api.patch(`/messages/${messageId}`, {
        ciphertext,
        ...(contentMeta ? { contentMeta } : {}),
      });
      return response.data as { message: Message };
    },
    onSuccess: (data, { chatId, messageId, text, chat }) => {
      const updated = data?.message;
      if (!updated) return;
      const editedAt =
        updated.editedAt != null
          ? typeof updated.editedAt === 'string'
            ? updated.editedAt
            : new Date(updated.editedAt as string | number | Date).toISOString()
          : new Date().toISOString();

      if (user?.id && isDmE2eeChat(chat ?? null)) {
        const cacheKey = updated.clientMessageId ?? messageId;
        rememberSentPlaintext(user.id, cacheKey, text, updated.id);
        if (updated.contentMeta && typeof updated.contentMeta === 'object') {
          const inner = { ...(updated.contentMeta as Record<string, unknown>) };
          delete inner.e2eeVersion;
          delete inner.preview;
          if (Object.keys(inner).length) {
            rememberSentPayloadMeta(user.id, cacheKey, inner, updated.id);
          }
        }
      }

      queryClient.setQueryData(['messages', chatId], (old: unknown) =>
        patchMessageInCache(old as Parameters<typeof patchMessageInCache>[0], messageId, {
          ciphertext: updated.ciphertext ?? '',
          editedAt,
          contentMeta: updated.contentMeta,
        }),
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
      queryClient.setQueryData(['messages', chatId], (old: unknown) =>
        removeMessageFromCache(old as Parameters<typeof removeMessageFromCache>[0], messageId),
      );
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

export const useChatUnreadBoundary = (chatId: string | null) => {
  return useQuery<ChatUnreadBoundary>({
    queryKey: ['chatUnread', chatId],
    queryFn: async () => {
      const response = await api.get(`/chats/${chatId}/unread`);
      return response.data as ChatUnreadBoundary;
    },
    enabled: !!chatId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

export const usePinnedMessages = (chatId: string | null) => {
  return useQuery<{ data: PinnedMessageEntry[] }>({
    queryKey: ['pins', chatId],
    queryFn: async () => {
      const response = await api.get(`/chats/${chatId}/pins`);
      return response.data;
    },
    enabled: !!chatId,
  });
};

export const usePinMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId }: { chatId: string; messageId: string }) => {
      const response = await api.post(`/messages/${messageId}/pin`);
      return response.data as { chatId: string; messageId: string };
    },
    onSuccess: ({ chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['pins', chatId] });
    },
  });
};

export const useUnpinMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId }: { chatId: string; messageId: string }) => {
      await api.delete(`/messages/${messageId}/pin`);
      return { messageId };
    },
    onSuccess: (_data, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['pins', chatId] });
    },
  });
};

export const useAddReaction = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { chatId: string; messageId: string; emoji: string }) => {
      const response = await api.post(`/messages/${messageId}/reactions`, { emoji });
      return response.data as { chatId: string; messageId: string; emoji: string };
    },
    onMutate: async ({ chatId, messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previous = queryClient.getQueryData(['messages', chatId]);
      queryClient.setQueryData(['messages', chatId], (old: any) =>
        patchReactionOnMessage(old, messageId, emoji, 'add', user?.id ?? '', user?.id ?? ''),
      );
      return { previous, chatId };
    },
    onError: (_err, { chatId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['messages', chatId], context.previous);
      }
    },
  });
};

export const useRemoveReaction = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { chatId: string; messageId: string; emoji: string }) => {
      await api.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
      return { messageId, emoji };
    },
    onMutate: async ({ chatId, messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previous = queryClient.getQueryData(['messages', chatId]);
      queryClient.setQueryData(['messages', chatId], (old: any) =>
        patchReactionOnMessage(old, messageId, emoji, 'remove', user?.id ?? '', user?.id ?? ''),
      );
      return { previous, chatId };
    },
    onError: (_err, { chatId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['messages', chatId], context.previous);
      }
    },
  });
};
