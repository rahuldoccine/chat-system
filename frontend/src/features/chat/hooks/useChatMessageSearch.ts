import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import { useMessageBodies } from '../../e2ee/useMessageBodies';
import { useMessages } from './useChatData';
import {
  isMessageDecryptPending,
  searchMessagesLocally,
} from '../utils/clientMessageSearch';

export type SearchMessageHit = {
  messageId: string;
  createdAt: string;
  snippet: string;
  sender: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    username: string | null;
  };
};

export type SearchMessagesResponse = {
  data: SearchMessageHit[];
  nextCursor: string | null;
  searchUnavailable?: boolean;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useChatMessageSearch(
  chatId: string | null,
  query: string,
  enabled: boolean,
  limit = 20,
) {
  const trimmed = query.trim();
  const debouncedQ = useDebouncedValue(trimmed, 300);
  const canSearch = enabled && Boolean(chatId) && debouncedQ.length >= 1;

  return useQuery<SearchMessagesResponse>({
    queryKey: ['chat-search', chatId, debouncedQ, limit],
    queryFn: async () => {
      const response = await api.get<SearchMessagesResponse>(
        `/chats/${chatId}/messages/search`,
        { params: { q: debouncedQ, limit } },
      );
      return response.data;
    },
    enabled: canSearch,
    staleTime: 30_000,
  });
}

/** Client-side search for E2EE chats (decrypt + match loaded history). */
export function useE2eeChatMessageSearch(
  chatId: string | null,
  query: string,
  enabled: boolean,
  limit = 20,
) {
  const { user } = useAuth();
  const trimmed = query.trim();
  const debouncedQ = useDebouncedValue(trimmed, 300);
  const active = enabled && Boolean(chatId) && debouncedQ.length >= 1;

  const {
    data: messages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: messagesLoading,
  } = useMessages(active ? chatId : null);

  const bodies = useMessageBodies(active && messages?.length ? messages : undefined);

  useEffect(() => {
    if (!active || !hasNextPage || isFetchingNextPage) return;
    const t = globalThis.setTimeout(() => {
      void fetchNextPage();
    }, 250);
    return () => globalThis.clearTimeout(t);
  }, [active, hasNextPage, isFetchingNextPage, fetchNextPage, messages?.length]);

  const data = useMemo((): SearchMessagesResponse => {
    if (!active || !messages?.length || !user?.id) {
      return { data: [], nextCursor: null };
    }
    return {
      data: searchMessagesLocally(messages, bodies, debouncedQ, user.id, limit),
      nextCursor: null,
    };
  }, [active, messages, bodies, debouncedQ, user?.id]);

  const isDecrypting = useMemo(() => {
    if (!active || !messages?.length || !user?.id) return false;
    return messages.some((m) => isMessageDecryptPending(m, bodies, user.id));
  }, [active, messages, bodies, user?.id]);

  return {
    data,
    isLoading: active && (messagesLoading || isDecrypting),
    isFetching: active && isFetchingNextPage,
  };
}
