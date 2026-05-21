import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export const CALL_HISTORY_PAGE_SIZE = 10;

export type CallHistoryRow = {
  id: string;
  chatId: string | null;
  initiatorId: string;
  peerId: string | null;
  kind: 'AUDIO' | 'VIDEO';
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  direction: 'dialed' | 'received' | 'missed';
  peer: {
    id: string;
    displayName: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
};

type CallHistoryPage = {
  data: CallHistoryRow[];
  nextCursor: string | null;
};

export function useCallHistory(
  chatId?: string,
  filter: 'all' | 'missed' | 'dialed' | 'received' = 'all',
) {
  const { isAuthenticated } = useAuth();
  return useInfiniteQuery({
    queryKey: ['calls', 'history', chatId, filter],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams();
      if (chatId) params.set('chatId', chatId);
      if (filter !== 'all') params.set('filter', filter);
      params.set('limit', String(CALL_HISTORY_PAGE_SIZE));
      if (pageParam) params.set('cursor', pageParam);
      const res = await api.get<CallHistoryPage>(`/calls/history?${params.toString()}`);
      return res.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated && Boolean(chatId),
  });
}
