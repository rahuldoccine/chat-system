import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchGroup } from '../../chat/api/groupsApi';

export type GroupParticipantProfile = {
  userId: string;
  label: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string;
  isLocal: boolean;
};

export function useGroupParticipantProfiles(
  chatId: string,
  participantIds: string[],
  localUserId?: string,
): GroupParticipantProfile[] {
  const { data: groupDetails } = useQuery({
    queryKey: ['group', chatId],
    queryFn: () => fetchGroup(chatId),
    enabled: Boolean(chatId),
    staleTime: 60_000,
  });

  return useMemo(() => {
    const unique = [...new Set(participantIds)];
    return unique.map((userId) => {
      const member = groupDetails?.members.find((m) => m.userId === userId);
      const label =
        userId === localUserId
          ? 'You'
          : member?.displayName || member?.username || member?.email || 'Participant';
      return {
        userId,
        label,
        avatarUrl: member?.avatarUrl,
        displayName: member?.displayName,
        email: member?.email,
        isLocal: userId === localUserId,
      };
    });
  }, [participantIds, groupDetails?.members, localUserId]);
}

export function gridLayoutClass(count: number): string {
  if (count <= 1) return 'grid1';
  if (count === 2) return 'grid2';
  if (count === 3) return 'grid3';
  if (count === 4) return 'grid4';
  if (count === 5) return 'grid5';
  if (count <= 6) return 'grid6';
  if (count <= 9) return 'grid9';
  return 'gridMany';
}
