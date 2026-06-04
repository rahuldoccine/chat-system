import { fetchGroup } from '../chat/api/groupsApi';

/** All member user IDs for group sender-key distribution (never publish with an empty list). */
export async function resolveGroupMemberIds(
  chatId: string,
  memberIds?: string[],
): Promise<string[]> {
  const fromInput = memberIds?.filter((id) => typeof id === 'string' && id.length > 0) ?? [];
  if (fromInput.length > 0) return [...new Set(fromInput)];

  const group = await fetchGroup(chatId);
  return [...new Set(group.members.map((m) => m.userId))];
}
