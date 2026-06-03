export function formatInChatSearchStatus(
  serverUnavailable: boolean,
  showLoading: boolean,
  total: number,
  query: string,
): string {
  if (serverUnavailable) return 'Unavailable';
  if (showLoading) return 'Searching…';
  if (total === 0) return query ? '0 results' : '';
  if (total === 1) return '1 result';
  return `${total} results`;
}
