import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, PhoneOff, Subtitles, Users, Video, VideoOff, WifiOff } from 'lucide-react';
import styles from './GroupCallOverlay.module.css';
import { useCallTimer } from '../useCallTimer';
import { useCallTranscript } from '../useCallTranscript';
import GroupCallParticipantGrid from './GroupCallParticipantGrid';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';

function groupCallParticipantIds(participants: string[], userId: string | undefined): string[] {
  if (participants.length) return participants;
  if (userId) return [userId];
  return [];
}

function groupCallKindLabel(kind: 'AUDIO' | 'VIDEO'): string {
  return kind === 'VIDEO' ? 'video' : 'voice';
}

type GroupCallOverlayProps = Readonly<{
  sessionId: string;
  chatId: string;
  kind: 'AUDIO' | 'VIDEO';
  participants: string[];
  localStream: MediaStream | null;
  startedAtMs: number | null;
  onLeave: () => void;
  onToggleMute: () => boolean;
  onToggleCamera: () => boolean;
}>;

const GroupCallOverlay: React.FC<GroupCallOverlayProps> = ({
  sessionId,
  chatId,
  kind,
  participants,
  localStream,
  startedAtMs,
  onLeave,
  onToggleMute,
  onToggleCamera,
}) => {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const timer = useCallTimer(Boolean(localStream && startedAtMs), startedAtMs);
  const muted = !localStream?.getAudioTracks()[0]?.enabled;
  const cameraOff = !localStream?.getVideoTracks()[0]?.enabled;
  const transcript = useCallTranscript(null, {
    myLabel: 'You',
    muted,
    mediaReady: Boolean(localStream),
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const overlay = (
    <div className={styles.overlay} data-session-id={sessionId}>
      {!isConnected && (
        <div className={styles.reconnectBanner}>
          <WifiOff size={14} />
          Reconnecting…
        </div>
      )}
      <div className={styles.header}>
        <Users size={18} />
        <span>Group {groupCallKindLabel(kind)} call</span>
        <span className={styles.dot}>•</span>
        <span>{participants.length || 1} participant(s)</span>
        <span className={styles.dot}>•</span>
        <span>{timer}</span>
      </div>

      <div className={styles.stage}>
        <GroupCallParticipantGrid
          chatId={chatId}
          participantIds={groupCallParticipantIds(participants, user?.id)}
          localUserId={user?.id}
          kind={kind}
          localStream={localStream}
        />
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
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        {kind === 'VIDEO' && (
          <button
            type="button"
            className={`${styles.ctrlBtn} ${cameraOff ? styles.ctrlBtnOff : ''}`}
            onClick={onToggleCamera}
            aria-label={cameraOff ? 'Camera on' : 'Camera off'}
          >
            {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}
        {transcript.supported && (
          <button
            type="button"
            className={`${styles.ctrlBtn} ${transcript.enabled ? styles.ctrlBtnActive : ''}`}
            onClick={transcript.toggle}
            aria-label={transcript.enabled ? 'Captions on' : 'Captions off'}
          >
            <Subtitles size={22} />
          </button>
        )}
        <button type="button" className={`${styles.ctrlBtn} ${styles.endBtn}`} onClick={onLeave}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default GroupCallOverlay;
