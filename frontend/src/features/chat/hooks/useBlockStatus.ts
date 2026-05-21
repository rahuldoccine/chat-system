import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/axios';

export type BlockStatus = {
  blockedByMe: boolean;
  blockedByPeer: boolean;
};

export const blockStatusQueryKey = (peerUserId: string) => ['blockStatus', peerUserId] as const;

export function useBlockStatus(peerUserId: string | undefined) {
  return useQuery({
    queryKey: blockStatusQueryKey(peerUserId ?? ''),
    queryFn: async () => {
      const res = await api.get<{ data: BlockStatus }>(
        `/moderation/blocks/status/${peerUserId}`,
      );
      return res.data.data;
    },
    enabled: Boolean(peerUserId),
  });
}

export function invalidateBlockStatus(queryClient: ReturnType<typeof useQueryClient>, peerUserId: string) {
  void queryClient.invalidateQueries({ queryKey: blockStatusQueryKey(peerUserId) });
}

export function applyBlockStatusFromSocket(
  queryClient: ReturnType<typeof useQueryClient>,
  currentUserId: string,
  payload: { blockerId: string; blockedId: string; blocked: boolean },
) {
  const { blockerId, blockedId, blocked } = payload;
  if (currentUserId !== blockerId && currentUserId !== blockedId) return;

  const peerUserId = currentUserId === blockerId ? blockedId : blockerId;
  queryClient.setQueryData<BlockStatus>(blockStatusQueryKey(peerUserId), {
    blockedByMe: currentUserId === blockerId && blocked,
    blockedByPeer: currentUserId === blockedId && blocked,
  });
}
