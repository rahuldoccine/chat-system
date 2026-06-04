import React, { memo } from 'react';
import UserAvatar from '../../chat/components/UserAvatar';
import LocalCallVideo from './LocalCallVideo';
import type { CameraFacing } from '../cameraSwitch';
import styles from './GroupCallOverlay.module.css';

type GroupCallLocalPipProps = Readonly<{
  stream: MediaStream | null;
  cameraOff: boolean;
  speaking: boolean;
  cameraFacing: CameraFacing;
  userId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string;
}>;

const GroupCallLocalPip: React.FC<GroupCallLocalPipProps> = ({
  stream,
  cameraOff,
  speaking,
  cameraFacing,
  userId,
  avatarUrl,
  displayName,
  email,
}) => {
  const showVideo = stream && !cameraOff;

  return (
    <div
      className={`${styles.pip} ${speaking ? styles.pipSpeaking : ''}`}
      aria-label="Your video"
    >
      <div className={styles.pipMedia}>
        {showVideo ? (
          <LocalCallVideo
            stream={stream}
            className={styles.pipVideo}
            mirrored={cameraFacing === 'user'}
          />
        ) : (
          <UserAvatar
            userId={userId}
            avatarUrl={avatarUrl}
            displayName={displayName}
            email={email}
            className={styles.pipAvatar}
            fallbackFontSize="1.5rem"
          />
        )}
      </div>
      <span className={styles.pipLabel}>You</span>
    </div>
  );
};

export default memo(GroupCallLocalPip);
