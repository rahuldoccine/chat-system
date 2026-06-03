import { useMemo } from 'react';
import type { GroupDetails } from '../api/groupsApi';
import { roleAtLeast } from '../utils/groupRoles';

export type MentionCandidate = {
  key: string;
  handle: string;
  label: string;
  userId?: string;
};

export function useComposerMentions(
  text: string,
  editingMessage: { id: string; text: string } | null | undefined,
  activeChatType: string | undefined,
  groupDetails: GroupDetails | undefined,
  viewerId: string | undefined,
): { mentionTokenMatch: RegExpMatchArray | null; mentionCandidates: MentionCandidate[] } {
  const mentionTokenMatch = useMemo(() => {
    if (editingMessage || activeChatType !== 'GROUP' || !groupDetails) return null;
    return /(?:^|\s)@([a-zA-Z0-9_.-]*)$/.exec(text);
  }, [text, editingMessage, activeChatType, groupDetails]);

  const mentionQuery = mentionTokenMatch?.[1]?.toLowerCase() ?? '';
  const canUseAllMention = roleAtLeast(groupDetails?.myRole ?? 'MEMBER', 'ADMIN');

  const mentionCandidates = useMemo(() => {
    if (activeChatType !== 'GROUP' || !groupDetails || !mentionTokenMatch) return [];
    const candidates: MentionCandidate[] = [];
    if (canUseAllMention && 'all'.includes(mentionQuery)) {
      candidates.push({ key: 'all', handle: 'all', label: 'Notify everyone in this group' });
    }
    for (const m of groupDetails.members) {
      if (m.userId === viewerId) continue;
      const baseHandle =
        m.username?.trim() ||
        m.displayName?.toLowerCase().replaceAll(/\s+/g, '') ||
        m.email.split('@')[0] ||
        'user';
      const handle = baseHandle.replaceAll(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
      const label = m.displayName || m.username || m.email;
      const hay = `${handle} ${label.toLowerCase()} ${m.email.toLowerCase()}`;
      if (!mentionQuery || hay.includes(mentionQuery)) {
        candidates.push({ key: m.userId, handle, label, userId: m.userId });
      }
      if (candidates.length >= 8) break;
    }
    return candidates;
  }, [activeChatType, groupDetails, mentionTokenMatch, canUseAllMention, mentionQuery, viewerId]);

  return { mentionTokenMatch, mentionCandidates };
}
