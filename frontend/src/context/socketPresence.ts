import type { QueryClient } from '@tanstack/react-query';

type ConversationList = { data: Array<{ dmPeer?: { id: string; isOnline?: boolean; lastSeenAt?: string } }>; nextCursor: string | null };

function patchConversationPeerPresence(
  chat: ConversationList['data'][number],
  userId: string,
  status: 'online' | 'offline',
  lastSeenAt?: string,
): ConversationList['data'][number] {
  if (chat.dmPeer?.id !== userId) return chat;
  return {
    ...chat,
    dmPeer: {
      ...chat.dmPeer,
      isOnline: status === 'online',
      lastSeenAt: lastSeenAt || chat.dmPeer.lastSeenAt,
    },
  };
}

export function applyPresenceToConversationCache(
  queryClient: QueryClient,
  data: { userId: string; status: 'online' | 'offline'; lastSeenAt?: string },
): void {
  queryClient.setQueryData<ConversationList>(['conversations'], (old) => {
    if (!old?.data) return old;
    return {
      ...old,
      data: old.data.map((chat) =>
        patchConversationPeerPresence(chat, data.userId, data.status, data.lastSeenAt),
      ),
    };
  });
}
