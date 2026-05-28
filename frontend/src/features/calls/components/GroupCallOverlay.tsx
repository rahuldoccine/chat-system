import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Subtitles, Users, Video, VideoOff } from 'lucide-react';
import styles from './GroupCallOverlay.module.css';
import { useCallTimer } from '../useCallTimer';
import { useCallTranscript } from '../useCallTranscript';

type GroupCallOverlayProps = {
  sessionId: string;
  chatId: string;
  kind: 'AUDIO' | 'VIDEO';
  participants: string[];
  localStream: MediaStream | null;
  startedAtMs: number | null;
  onLeave: () => void;
  onToggleMute: () => boolean;
  onToggleCamera: () => boolean;
};

const GroupCallOverlay: React.FC<GroupCallOverlayProps> = ({
  sessionId,
  kind,
  participants,
  localStream,
  startedAtMs,
  onLeave,
  onToggleMute,
  onToggleCamera,
}) => {
  const localRef = useRef<HTMLVideoElement>(null);
  const timer = useCallTimer(Boolean(localStream && startedAtMs), startedAtMs);
  const muted = !localStream?.getAudioTracks()[0]?.enabled;
  const cameraOff = !localStream?.getVideoTracks()[0]?.enabled;
  const transcript = useCallTranscript(null, {
    myLabel: 'You',
    muted,
    mediaReady: Boolean(localStream),
  });

  useEffect(() => {
    if (localRef.current) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <div className={styles.overlay} data-session-id={sessionId}>
      <div className={styles.header}>
        <Users size={18} />
        <span>Group {kind === 'VIDEO' ? 'video' : 'voice'} call</span>
        <span className={styles.dot}>•</span>
        <span>{participants.length || 1} participant(s)</span>
        <span className={styles.dot}>•</span>
        <span>{timer}</span>
      </div>

      <div className={styles.stage}>
        {kind === 'VIDEO' && localStream ? (
          <video ref={localRef} className={styles.localVideo} autoPlay playsInline muted />
        ) : (
          <div className={styles.audioState}>
            <Users size={44} />
            <p>Voice call in progress</p>
          </div>
        )}
        {transcript.enabled && (
          <div className={styles.captions}>
            {transcript.displayRows.map((row) => (
              <p key={row.key}>
                <strong>{row.speaker}:</strong> {row.text}
              </p>
            ))}
            {transcript.interimText ? (
              <p className={styles.captionInterim}>
                <strong>You:</strong> {transcript.interimText}
              </p>
            ) : null}
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
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        {kind === 'VIDEO' && (
          <button
            type="button"
            className={`${styles.ctrlBtn} ${cameraOff ? styles.ctrlBtnOff : ''}`}
            onClick={onToggleCamera}
            aria-label={cameraOff ? 'Camera on' : 'Camera off'}
          >
            {cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
        )}
        {transcript.supported && (
          <button
            type="button"
            className={`${styles.ctrlBtn} ${transcript.enabled ? styles.ctrlBtnActive : ''}`}
            onClick={transcript.toggle}
            aria-label={transcript.enabled ? 'Captions on' : 'Captions off'}
          >
            <Subtitles size={20} />
          </button>
        )}
        <button type="button" className={`${styles.ctrlBtn} ${styles.endBtn}`} onClick={onLeave}>
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
};

export default GroupCallOverlay;
