import type { QueryClient } from '@tanstack/react-query';

/** Refetch sidebar unread counts and previews from the server. */
export function invalidateConversationList(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['conversations'] });
}

/** Refetch people search (e.g. after db:seed-test / db:remove-seed). */
export function invalidateUsersSearch(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['users', 'search'] });
}

/** Drop cached chat data when the authenticated user session ends. */
export function clearChatSessionCaches(queryClient: QueryClient) {
  queryClient.clear();
}
