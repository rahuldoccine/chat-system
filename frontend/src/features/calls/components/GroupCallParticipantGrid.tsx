import React, { memo } from 'react';
import UserAvatar from '../../chat/components/UserAvatar';
import styles from './GroupCallParticipantGrid.module.css';
import {
  gridLayoutClass,
  useGroupParticipantProfiles,
  type GroupParticipantProfile,
} from './groupCallParticipants';

type GroupCallParticipantGridProps = Readonly<{
  chatId: string;
  participantIds: string[];
  localUserId?: string;
  /** When true, local user is shown in PiP — exclude from main grid. */
  excludeLocalFromGrid?: boolean;
  activeSpeakerId?: string | null;
}>;

function RemoteTile({
  profile,
  speaking,
  active,
}: Readonly<{
  profile: GroupParticipantProfile;
  speaking: boolean;
  active: boolean;
}>) {
  return (
    <div
      className={`${styles.tile} ${speaking ? styles.tileSpeaking : ''} ${active ? styles.tileActive : ''}`}
    >
      <div className={styles.tileMedia}>
        <UserAvatar
          userId={profile.userId}
          avatarUrl={profile.avatarUrl}
          displayName={profile.displayName}
          email={profile.email}
          className={styles.tileAvatar}
          fallbackFontSize="2rem"
        />
        {speaking && <span className={styles.speakingRing} aria-hidden />}
      </div>
      <span className={styles.tileName}>{profile.label}</span>
    </div>
  );
}

const GroupCallParticipantGrid: React.FC<GroupCallParticipantGridProps> = ({
  chatId,
  participantIds,
  localUserId,
  excludeLocalFromGrid = false,
  activeSpeakerId = null,
}) => {
  const profiles = useGroupParticipantProfiles(chatId, participantIds, localUserId);
  const visible = excludeLocalFromGrid ? profiles.filter((p) => !p.isLocal) : profiles;
  const layout = gridLayoutClass(Math.max(visible.length, 1));

  if (visible.length === 0) {
    return (
      <div className={styles.emptyStage}>
        <p>Waiting for others to join…</p>
      </div>
    );
  }

  return (
    <div className={`${styles.grid} ${styles[layout]}`}>
      {visible.map((p) => (
        <RemoteTile
          key={p.userId}
          profile={p}
          speaking={activeSpeakerId === p.userId}
          active={activeSpeakerId === p.userId}
        />
      ))}
    </div>
  );
};

export default memo(GroupCallParticipantGrid);
