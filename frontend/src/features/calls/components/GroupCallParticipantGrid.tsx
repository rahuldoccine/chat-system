import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchGroup } from '../../chat/api/groupsApi';
import UserAvatar from '../../chat/components/UserAvatar';
import styles from './GroupCallParticipantGrid.module.css';

type GroupCallParticipantGridProps = {
  chatId: string;
  participantIds: string[];
  localUserId?: string;
  kind: 'AUDIO' | 'VIDEO';
  localStream?: MediaStream | null;
};

type ParticipantProfile = {
  userId: string;
  label: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string;
};

const GroupCallParticipantGrid: React.FC<GroupCallParticipantGridProps> = ({
  chatId,
  participantIds,
  localUserId,
  kind,
  localStream,
}) => {
  const { data: groupDetails } = useQuery({
    queryKey: ['group', chatId],
    queryFn: () => fetchGroup(chatId),
    enabled: Boolean(chatId),
    staleTime: 60_000,
  });

  const profiles: ParticipantProfile[] = useMemo(() => {
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
      };
    });
  }, [participantIds, groupDetails?.members, localUserId]);

  return (
    <div className={styles.grid}>
      {profiles.map((p) => (
        <div key={p.userId} className={styles.tile}>
          {kind === 'VIDEO' && p.userId === localUserId && localStream ? (
            <video
              className={styles.tileVideo}
              autoPlay
              playsInline
              muted
              ref={(el) => {
                if (el) el.srcObject = localStream;
              }}
            />
          ) : (
            <UserAvatar
              userId={p.userId}
              avatarUrl={p.avatarUrl}
              displayName={p.displayName}
              email={p.email}
              className={styles.tileAvatar}
            />
          )}
          <span className={styles.tileName}>{p.label}</span>
        </div>
      ))}
    </div>
  );
};

export default GroupCallParticipantGrid;
