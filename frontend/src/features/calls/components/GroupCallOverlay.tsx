import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Mic,
  MicOff,
  PanelRight,
  PhoneOff,
  Subtitles,
  SwitchCamera,
  Video,
  VideoOff,
  WifiOff,
} from 'lucide-react';
import styles from './GroupCallOverlay.module.css';
import { useCallTimer } from '../useCallTimer';
import { useCallTranscript } from '../useCallTranscript';
import { useAudioSpeaking } from '../useAudioSpeaking';
import GroupCallParticipantGrid from './GroupCallParticipantGrid';
import GroupCallParticipantPanel from './GroupCallParticipantPanel';
import GroupCallLocalPip from './GroupCallLocalPip';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import { fetchGroup } from '../../chat/api/groupsApi';
import { handler } from '../../../utils/asyncHandler';
import type { CameraFacing } from '../cameraSwitch';

function groupCallParticipantIds(participants: string[], userId: string | undefined): string[] {
  if (participants.length) return participants;
  if (userId) return [userId];
  return [];
}

function groupCallKindLabel(kind: 'AUDIO' | 'VIDEO'): string {
  return kind === 'VIDEO' ? 'Video' : 'Voice';
}

function GroupCallTimer({
  active,
  startedAtMs,
}: Readonly<{ active: boolean; startedAtMs: number | null }>) {
  const timer = useCallTimer(active, startedAtMs);
  return <span className={styles.headerMeta}>{timer}</span>;
}

type GroupCallOverlayProps = Readonly<{
  sessionId: string;
  chatId: string;
  kind: 'AUDIO' | 'VIDEO';
  participants: string[];
  remoteStreams: Record<string, MediaStream>;
  localStream: MediaStream | null;
  startedAtMs: number | null;
  onLeave: () => void;
  onToggleMute: () => boolean;
  onToggleCamera: () => boolean;
  onSwitchCamera: () => Promise<boolean>;
  cameraFacing: CameraFacing;
}>;

const GroupCallOverlay: React.FC<GroupCallOverlayProps> = ({
  sessionId,
  chatId,
  kind,
  participants,
  remoteStreams,
  localStream,
  startedAtMs,
  onLeave,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
  cameraFacing,
}) => {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const muted = !localStream?.getAudioTracks()[0]?.enabled;
  const cameraOff = !localStream?.getVideoTracks()[0]?.enabled;
  const localSpeaking = useAudioSpeaking(localStream);
  const activeSpeakerId = localSpeaking ? user?.id ?? null : null;

  const participantIds = useMemo(
    () => groupCallParticipantIds(participants, user?.id),
    [participants, user?.id],
  );

  const { data: groupDetails } = useQuery({
    queryKey: ['group', chatId],
    queryFn: () => fetchGroup(chatId),
    enabled: Boolean(chatId),
    staleTime: 60_000,
  });

  const localMember = groupDetails?.members.find((m) => m.userId === user?.id);

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

  const groupTitle = groupDetails?.title || 'Group call';
  const isVideo = kind === 'VIDEO';
  const useLocalPip = isVideo && Boolean(localStream);

  const overlay = (
    <div className={styles.overlay} data-session-id={sessionId}>
      {!isConnected && (
        <div className={styles.reconnectBanner}>
          <WifiOff size={14} />
          Reconnecting…
        </div>
      )}

      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.headerTitle}>{groupTitle}</h1>
          <p className={styles.headerSub}>
            {groupCallKindLabel(kind)} · {participantIds.length} in call
          </p>
        </div>
        <div className={styles.headerRight}>
          <GroupCallTimer active={Boolean(localStream && startedAtMs)} startedAtMs={startedAtMs} />
          <button
            type="button"
            className={styles.panelToggle}
            onClick={() => setMobilePanelOpen((o) => !o)}
            aria-label={mobilePanelOpen ? 'Hide participants' : 'Show participants'}
            aria-expanded={mobilePanelOpen}
          >
            <PanelRight size={20} />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.main}>
          {isVideo ? (
            <div className={styles.videoStage}>
              <GroupCallParticipantGrid
                chatId={chatId}
                participantIds={participantIds}
                localUserId={user?.id}
                excludeLocalFromGrid={useLocalPip}
                activeSpeakerId={activeSpeakerId}
                remoteStreams={remoteStreams}
                isVideoCall
              />
              {useLocalPip && (
                <GroupCallLocalPip
                  stream={localStream}
                  cameraOff={cameraOff}
                  speaking={localSpeaking}
                  cameraFacing={cameraFacing}
                  userId={user?.id}
                  avatarUrl={localMember?.avatarUrl}
                  displayName={localMember?.displayName}
                  email={localMember?.email}
                />
              )}
            </div>
          ) : (
            <div className={styles.audioStage}>
              <GroupCallParticipantGrid
                chatId={chatId}
                participantIds={participantIds}
                localUserId={user?.id}
                activeSpeakerId={activeSpeakerId}
                remoteStreams={remoteStreams}
                isVideoCall={false}
              />
            </div>
          )}

          {transcript.enabled && (
            <div className={styles.captions} aria-live="polite">
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

        <div className={`${styles.sidebarWrap} ${mobilePanelOpen ? styles.sidebarOpen : ''}`}>
          <GroupCallParticipantPanel
            chatId={chatId}
            participantIds={participantIds}
            localUserId={user?.id}
            localMuted={muted}
            localCameraOff={cameraOff}
            kind={kind}
            activeSpeakerId={activeSpeakerId}
          />
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlRow}>
          <button
            type="button"
            className={`${styles.ctrlBtn} ${muted ? styles.ctrlBtnOff : styles.ctrlBtnActive}`}
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          {isVideo && (
            <>
              <button
                type="button"
                className={`${styles.ctrlBtn} ${cameraOff ? styles.ctrlBtnOff : styles.ctrlBtnActive}`}
                onClick={onToggleCamera}
                aria-label={cameraOff ? 'Camera on' : 'Camera off'}
              >
                {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
              <button
                type="button"
                className={styles.ctrlBtn}
                onClick={handler(() => {
                  void onSwitchCamera();
                })}
                aria-label="Switch camera"
              >
                <SwitchCamera size={22} />
              </button>
            </>
          )}
          {transcript.supported && (
            <button
              type="button"
              className={`${styles.ctrlBtn} ${transcript.enabled ? styles.ctrlBtnCaptionsOn : ''}`}
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
    </div>
  );

  return createPortal(overlay, document.body);
};

export default GroupCallOverlay;
