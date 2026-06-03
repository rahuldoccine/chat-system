import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Chat, Message } from '../../chat/types';
import type { DiscoverableUser } from '../../chat/hooks/useChatData';
import type { MessagePage } from '../../chat/utils/messageQueryCache';
import type { Profile } from '../hooks/useUserSettings';

export type ProfileBroadcast = Pick<
  Profile,
  'id' | 'displayName' | 'username' | 'avatarUrl'
> & { email?: string };

function patchMessage(message: Message, profile: ProfileBroadcast): Message {
  let next = message;

  if (message.senderId === profile.id) {
    const displayName = profile.displayName ?? message.sender.displayName;
    next = {
      ...next,
      sender: {
        ...next.sender,
        displayName,
        name: displayName ?? next.sender.name,
        ...(profile.avatarUrl === undefined
          ? {}
          : { avatarUrl: profile.avatarUrl ?? undefined }),
      },
    };
  }

  if (
    next.replyTo?.senderId === profile.id &&
    next.replyTo.sender &&
    profile.displayName != null
  ) {
    next = {
      ...next,
      replyTo: {
        ...next.replyTo,
        sender: {
          ...next.replyTo.sender,
          displayName: profile.displayName,
        },
      },
    };
  }

  return next;
}

export function syncUserProfileInCaches(
  queryClient: QueryClient,
  profile: ProfileBroadcast,
): void {
  queryClient.setQueryData<Profile>(['profile'], (old) =>
    old?.id === profile.id
      ? {
          ...old,
          displayName: profile.displayName ?? old.displayName,
          username: profile.username ?? old.username,
          avatarUrl: profile.avatarUrl,
        }
      : old,
  );

  queryClient.setQueryData<{ data: Chat[]; nextCursor: string | null }>(
    ['conversations'],
    (old) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: old.data.map((chat) => {
          if (chat.dmPeer?.id === profile.id) {
            return {
              ...chat,
              dmPeer: {
                ...chat.dmPeer,
                ...(profile.displayName == null
                  ? {}
                  : { displayName: profile.displayName }),
                ...(profile.username === undefined
                  ? {}
                  : { username: profile.username ?? undefined }),
                ...(profile.avatarUrl === undefined
                  ? {}
                  : { avatarUrl: profile.avatarUrl ?? undefined }),
              },
            };
          }
          return chat;
        }),
      };
    },
  );

  const messageQueries = queryClient.getQueriesData<InfiniteData<MessagePage>>({
    queryKey: ['messages'],
  });
  for (const [key, data] of messageQueries) {
    if (!data?.pages) continue;
    queryClient.setQueryData<InfiniteData<MessagePage>>(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        data: page.data.map((m) => patchMessage(m, profile)),
      })),
    });
  }

  queryClient.setQueriesData<{ data: DiscoverableUser[] }>(
    { queryKey: ['users', 'search'] },
    (old) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: old.data.map((u) =>
          u.id === profile.id
            ? {
                ...u,
                displayName: profile.displayName ?? u.displayName,
                username: profile.username ?? u.username,
                avatarUrl: profile.avatarUrl ?? u.avatarUrl,
              }
            : u,
        ),
      };
    },
  );
}
