import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api/axios';

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

export function useChatMessageSearch(chatId: string | null, query: string, enabled: boolean) {
  const trimmed = query.trim();
  const debouncedQ = useDebouncedValue(trimmed, 300);
  const canSearch = enabled && Boolean(chatId) && debouncedQ.length >= 1;

  return useQuery<SearchMessagesResponse>({
    queryKey: ['chat-search', chatId, debouncedQ],
    queryFn: async () => {
      const response = await api.get<SearchMessagesResponse>(
        `/chats/${chatId}/messages/search`,
        { params: { q: debouncedQ, limit: 20 } },
      );
      return response.data;
    },
    enabled: canSearch,
    staleTime: 30_000,
  });
}
