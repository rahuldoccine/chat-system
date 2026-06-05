import React, { memo } from 'react';
import UserAvatar from '../../chat/components/UserAvatar';
import { useAudioSpeaking } from '../useAudioSpeaking';
import GroupCallRemoteVideo from './GroupCallRemoteVideo';
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
  remoteStreams?: Record<string, MediaStream>;
  isVideoCall?: boolean;
}>;

function RemoteTile({
  profile,
  speaking,
  active,
  remoteStream,
  showVideo,
}: Readonly<{
  profile: GroupParticipantProfile;
  speaking: boolean;
  active: boolean;
  remoteStream: MediaStream | null;
  showVideo: boolean;
}>) {
  const videoOn =
    showVideo &&
    remoteStream != null &&
    remoteStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  return (
    <div
      className={`${styles.tile} ${speaking ? styles.tileSpeaking : ''} ${active ? styles.tileActive : ''}`}
    >
      <div className={styles.tileMedia}>
        {videoOn && remoteStream ? (
          <GroupCallRemoteVideo stream={remoteStream} className={styles.tileVideo} />
        ) : (
          <UserAvatar
            userId={profile.userId}
            avatarUrl={profile.avatarUrl}
            displayName={profile.displayName}
            email={profile.email}
            className={styles.tileAvatar}
            fallbackFontSize="2rem"
          />
        )}
        {speaking && <span className={styles.speakingRing} aria-hidden />}
      </div>
      <span className={styles.tileName}>{profile.label}</span>
    </div>
  );
}

function RemoteTileWithSpeaking(
  props: Readonly<{
    profile: GroupParticipantProfile;
    active: boolean;
    remoteStream: MediaStream | null;
    showVideo: boolean;
  }>,
) {
  const speaking = useAudioSpeaking(props.remoteStream, 0.05);
  return (
    <RemoteTile
      profile={props.profile}
      speaking={speaking}
      active={props.active || speaking}
      remoteStream={props.remoteStream}
      showVideo={props.showVideo}
    />
  );
}

const GroupCallParticipantGrid: React.FC<GroupCallParticipantGridProps> = ({
  chatId,
  participantIds,
  localUserId,
  excludeLocalFromGrid = false,
  activeSpeakerId = null,
  remoteStreams = {},
  isVideoCall = false,
}) => {
  const profiles = useGroupParticipantProfiles(chatId, participantIds, localUserId);
  const visible = excludeLocalFromGrid ? profiles.filter((p) => !p.isLocal) : profiles;
  const layout = gridLayoutClass(Math.max(visible.length, 1));

  if (visible.length === 0) {
    return (
      <div className={styles.emptyStage}>
        <p>
          {excludeLocalFromGrid
            ? "You're the only one here — waiting for others to join…"
            : 'Waiting for others to join…'}
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.grid} ${styles[layout]}`}>
      {visible.map((p) => (
        <RemoteTileWithSpeaking
          key={p.userId}
          profile={p}
          active={activeSpeakerId === p.userId}
          remoteStream={remoteStreams[p.userId] ?? null}
          showVideo={isVideoCall}
        />
      ))}
    </div>
  );
};

export default memo(GroupCallParticipantGrid);
