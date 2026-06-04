import React, { memo } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import UserAvatar from '../../chat/components/UserAvatar';
import styles from './GroupCallParticipantPanel.module.css';
import { useGroupParticipantProfiles } from './groupCallParticipants';

type GroupCallParticipantPanelProps = Readonly<{
  chatId: string;
  participantIds: string[];
  localUserId?: string;
  localMuted: boolean;
  localCameraOff: boolean;
  kind: 'AUDIO' | 'VIDEO';
  activeSpeakerId?: string | null;
}>;

const GroupCallParticipantPanel: React.FC<GroupCallParticipantPanelProps> = ({
  chatId,
  participantIds,
  localUserId,
  localMuted,
  localCameraOff,
  kind,
  activeSpeakerId,
}) => {
  const profiles = useGroupParticipantProfiles(chatId, participantIds, localUserId);

  return (
    <aside className={styles.panel} aria-label="Participants">
      <div className={styles.panelHeader}>
        <h2>Participants</h2>
        <span className={styles.count}>{profiles.length}</span>
      </div>
      <ul className={styles.list}>
        {profiles.map((p) => {
          const isActive = activeSpeakerId === p.userId;
          const showLocalAV = p.isLocal;
          return (
            <li key={p.userId} className={`${styles.row} ${isActive ? styles.rowActive : ''}`}>
              <UserAvatar
                userId={p.userId}
                avatarUrl={p.avatarUrl}
                displayName={p.displayName}
                email={p.email}
                className={styles.rowAvatar}
                fallbackFontSize="0.85rem"
              />
              <span className={styles.rowName}>{p.label}</span>
              {showLocalAV && (
                <span className={styles.rowIcons}>
                  {localMuted ? (
                    <MicOff size={14} aria-label="Muted" />
                  ) : (
                    <Mic size={14} aria-label="Mic on" />
                  )}
                  {kind === 'VIDEO' &&
                    (localCameraOff ? (
                      <VideoOff size={14} aria-label="Camera off" />
                    ) : (
                      <Video size={14} aria-label="Camera on" />
                    ))}
                </span>
              )}
              {isActive && <span className={styles.speakingDot} title="Speaking" />}
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

export default memo(GroupCallParticipantPanel);
