import React, { memo, useRef } from 'react';
import { Maximize2, Minimize2, Minus, Video } from 'lucide-react';
import UserAvatar from '../../chat/components/UserAvatar';
import LocalCallVideo from './LocalCallVideo';
import {
  useLocalPipPosition,
  type PipCorner,
  type PipPrefs,
  type PipSize,
} from '../hooks/useLocalPipPosition';
import type { CameraFacing } from '../cameraSwitch';
import styles from './CallLocalPip.module.css';

type CallLocalPipProps = Readonly<{
  stream: MediaStream | null;
  cameraOff: boolean;
  speaking: boolean;
  cameraFacing: CameraFacing;
  stageRef: React.RefObject<HTMLElement | null>;
  variant?: 'group' | 'dm';
  label?: string;
  userId?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string;
}>;

const CallLocalPip: React.FC<CallLocalPipProps> = ({
  stream,
  cameraOff,
  speaking,
  cameraFacing,
  stageRef,
  variant = 'group',
  label = 'You',
  userId,
  avatarUrl,
  displayName,
  email,
}) => {
  const pipRef = useRef<HTMLDivElement>(null);
  const { prefs, pipStyle, chipStyle, isDragging, setHidden, toggleSize, dragHandlers } =
    useLocalPipPosition({ stageRef, pipRef });

  const showVideo = stream && !cameraOff;

  if (prefs.hidden) {
    return (
      <button
        type="button"
        className={styles.restoreChip}
        style={chipStyle}
        onClick={() => setHidden(false)}
        aria-label="Show my video"
      >
        <Video size={14} aria-hidden />
        Show my video
      </button>
    );
  }

  return (
    <div
      ref={pipRef}
      className={`${styles.pip} ${speaking ? styles.pipSpeaking : ''} ${isDragging ? styles.pipDragging : ''}`}
      style={pipStyle}
      aria-label="Your video"
    >
      <div
        className={styles.dragSurface}
        {...dragHandlers}
      >
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.ctrlBtn}
            onClick={toggleSize}
            aria-label={prefs.size === 'compact' ? 'Default size' : 'Compact size'}
            title={prefs.size === 'compact' ? 'Default size' : 'Compact size'}
          >
            {prefs.size === 'compact' ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button
            type="button"
            className={styles.ctrlBtn}
            onClick={() => setHidden(true)}
            aria-label="Minimize my video"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
        </div>
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
              displayName={displayName ?? label}
              email={email}
              className={styles.pipAvatar}
              fallbackFontSize="1.5rem"
            />
          )}
        </div>
        {variant === 'group' && <span className={styles.pipLabel}>{label}</span>}
      </div>
    </div>
  );
};

export type { PipCorner, PipPrefs, PipSize };
export default memo(CallLocalPip);
