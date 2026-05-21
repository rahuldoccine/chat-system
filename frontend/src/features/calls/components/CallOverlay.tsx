import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Subtitles,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import UserAvatar from '../../chat/components/UserAvatar';
import { useCallTimer } from '../useCallTimer';
import { useCallTranscript } from '../useCallTranscript';
import styles from './CallOverlay.module.css';

type CallOverlayProps = {
  peerUserId?: string;
  peerName: string;
  peerAvatarUrl?: string | null;
  statusLabel: string;
  isVideo: boolean;
  callId: string | null;
  connectedAt: number | null;
  remotePeerMuted: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => Promise<boolean>;
  onEndTranscript?: () => void;
};

const CallOverlay: React.FC<CallOverlayProps> = ({
  peerUserId,
  peerName,
  peerAvatarUrl,
  statusLabel,
  isVideo,
  callId,
  connectedAt,
  remotePeerMuted,
  localStream,
  remoteStream,
  onHangUp,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
  onEndTranscript,
}) => {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const timer = useCallTimer(Boolean(connectedAt), connectedAt);
  const transcript = useCallTranscript(callId);

  const muted = !localStream?.getAudioTracks()[0]?.enabled;
  const cameraOff = !localStream?.getVideoTracks()[0]?.enabled;
  const showVideo = isVideo && (localStream || remoteStream);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    return () => {
      void transcript.upload();
      transcript.reset();
      onEndTranscript?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  const toggleSpeaker = async () => {
    const el = remoteRef.current;
    if (!el || !('setSinkId' in HTMLMediaElement.prototype)) {
      setSpeakerOn((s) => !s);
      return;
    }
    try {
      if (speakerOn) {
        await (el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }).setSinkId('');
        el.muted = true;
      } else {
        el.muted = false;
      }
      setSpeakerOn((s) => !s);
    } catch {
      setSpeakerOn((s) => !s);
    }
  };

  const supportsSink = 'setSinkId' in HTMLMediaElement.prototype;

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.header}>
        <UserAvatar
          userId={peerUserId}
          avatarUrl={peerAvatarUrl}
          displayName={peerName}
          className={styles.headerAvatar}
          fallbackFontSize="1.25rem"
        />
        <div>
          <div className={styles.headerTitle}>{peerName}</div>
          <div className={styles.headerSub}>
            {statusLabel}
            {connectedAt ? ` · ${timer}` : ''}
            {remotePeerMuted ? ' · muted' : ''}
          </div>
        </div>
      </div>

      <div className={styles.stage}>
        {showVideo && remoteStream ? (
          <video ref={remoteRef} className={styles.remoteVideo} autoPlay playsInline />
        ) : (
          <div className={styles.audioOnly}>
            <UserAvatar
              userId={peerUserId}
              avatarUrl={peerAvatarUrl}
              displayName={peerName}
              className={styles.largeAvatar}
              fallbackFontSize="2.5rem"
            />
            <span>{statusLabel}</span>
          </div>
        )}
        {showVideo && localStream && (
          <div className={styles.localPip}>
            <video ref={localRef} className={styles.localVideo} autoPlay playsInline muted />
          </div>
        )}
        {transcript.enabled && transcript.lines.length > 0 && (
          <div className={styles.captions}>
            {transcript.lines.slice(-3).map((line, i) => (
              <p key={`${line.t}-${i}`}>{line.text}</p>
            ))}
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.ctrlBtn} ${muted ? styles.ctrlBtnOff : ''}`}
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        {isVideo && (
          <>
            <button
              type="button"
              className={`${styles.ctrlBtn} ${cameraOff ? styles.ctrlBtnOff : ''}`}
              onClick={onToggleCamera}
              aria-label={cameraOff ? 'Camera on' : 'Camera off'}
            >
              {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={() => void onSwitchCamera()}
              aria-label="Switch camera"
            >
              <SwitchCamera size={22} />
            </button>
          </>
        )}
        {supportsSink && (
          <button
            type="button"
            className={`${styles.ctrlBtn} ${!speakerOn ? styles.ctrlBtnOff : ''}`}
            onClick={() => void toggleSpeaker()}
            aria-label="Speaker"
          >
            {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </button>
        )}
        {transcript.supported && (
          <button
            type="button"
            className={`${styles.ctrlBtn} ${transcript.enabled ? styles.ctrlBtnOn : ''}`}
            onClick={transcript.toggle}
            aria-label="Captions"
            title={transcript.enabled ? 'Stop captions' : 'Live captions (this device)'}
          >
            <Subtitles size={22} />
          </button>
        )}
        <button
          type="button"
          className={`${styles.ctrlBtn} ${styles.endBtn}`}
          onClick={onHangUp}
          aria-label="End call"
        >
          <PhoneOff size={22} />
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default CallOverlay;
