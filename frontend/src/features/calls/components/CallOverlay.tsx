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
  Wifi,
  WifiOff,
} from 'lucide-react';
import UserAvatar from '../../chat/components/UserAvatar';
import { useCallTimer } from '../useCallTimer';
import { useAuth } from '../../../context/AuthContext';
import { CAPTION_LANGUAGES, useCallTranscript } from '../useCallTranscript';
import { useAudioSpeaking } from '../useAudioSpeaking';
import type { CallConnectionUiState } from '../CallManager';
import type { CallPhase } from '../types';
import type { CameraFacing } from '../cameraSwitch';
import CallLocalPip from './CallLocalPip';
import styles from './CallOverlay.module.css';
import { handler } from '../../../utils/asyncHandler';

type CallOverlayProps = Readonly<{
  peerUserId?: string;
  peerName: string;
  peerAvatarUrl?: string | null;
  statusLabel: string;
  phase: CallPhase;
  isVideo: boolean;
  callId: string | null;
  connectedAt: number | null;
  connectionUi: CallConnectionUiState;
  remotePeerMuted: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => Promise<boolean>;
  cameraFacing: CameraFacing;
  onEndTranscript?: () => void;
}>;

function connectionLabel(state: CallConnectionUiState): string {
  switch (state) {
    case 'good':
      return 'Good connection';
    case 'poor':
      return 'Poor connection';
    case 'reconnecting':
      return 'Reconnecting…';
    default:
      return 'Connecting…';
  }
}

type TranscriptUi = ReturnType<typeof useCallTranscript>;

function CallOverlayCaptions({
  transcript,
  myLabel,
}: Readonly<{
  transcript: TranscriptUi;
  myLabel: string;
}>) {
  if (!transcript.enabled) return null;
  return (
    <div className={styles.captions} aria-live="polite">
      {transcript.displayRows.map((row) => (
        <p key={row.key} className={styles.captionLine}>
          <span className={styles.captionSpeaker}>{row.speaker}:</span> {row.text}
        </p>
      ))}
      {transcript.interimText ? (
        <p className={styles.captionInterim}>
          <span className={styles.captionSpeaker}>{myLabel}:</span> {transcript.interimText}
        </p>
      ) : null}
      {transcript.hasCaptions ? null : (
        <p className={styles.captionsPlaceholder}>Listening for speech…</p>
      )}
      {transcript.statusHint ? (
        <p className={styles.captionHint}>{transcript.statusHint}</p>
      ) : null}
    </div>
  );
}

function CallOverlayControls({
  muted,
  cameraOff,
  isVideo,
  speakerOn,
  supportsSink,
  endLabel,
  transcript,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
  onToggleSpeaker,
  onHangUp,
}: Readonly<{
  muted: boolean;
  cameraOff: boolean;
  isVideo: boolean;
  speakerOn: boolean;
  supportsSink: boolean;
  endLabel: string;
  transcript: TranscriptUi;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => Promise<boolean>;
  onToggleSpeaker: () => void;
  onHangUp: () => void;
}>) {
  return (
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
        {supportsSink && (
          <button
            type="button"
            className={`${styles.ctrlBtn} ${speakerOn ? styles.ctrlBtnActive : styles.ctrlBtnOff}`}
            onClick={handler(onToggleSpeaker)}
            aria-label={speakerOn ? 'Speaker on' : 'Speaker off'}
          >
            {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </button>
        )}
        {transcript.supported && (
          <button
            type="button"
            className={`${styles.ctrlBtn} ${transcript.enabled ? styles.ctrlBtnCaptionsOn : ''}`}
            onClick={transcript.toggle}
            aria-label={transcript.enabled ? 'Captions ON' : 'Captions OFF'}
            aria-pressed={transcript.enabled}
            title={transcript.enabled ? 'Captions ON' : 'Captions OFF'}
          >
            <Subtitles size={22} strokeWidth={transcript.enabled ? 2.5 : 2} />
          </button>
        )}
        <button
          type="button"
          className={`${styles.ctrlBtn} ${styles.endBtn}`}
          onClick={onHangUp}
          aria-label={endLabel}
          title={endLabel}
        >
          <PhoneOff size={22} />
        </button>
      </div>
      {transcript.supported && (
        <div className={styles.captionMeta}>
          <span className={transcript.enabled ? styles.captionOn : styles.captionOff}>
            {transcript.enabled ? 'Captions ON' : 'Captions OFF'}
          </span>
          <label className={styles.langSelect}>
            <span className={styles.srOnly}>Caption language</span>
            <select
              value={transcript.language}
              onChange={(e) => transcript.applyLanguage(e.target.value)}
              aria-label="Caption language"
            >
              {CAPTION_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

const CallOverlay: React.FC<CallOverlayProps> = ({
  peerUserId,
  peerName,
  peerAvatarUrl,
  statusLabel,
  phase,
  isVideo,
  callId,
  connectedAt,
  connectionUi,
  remotePeerMuted,
  localStream,
  remoteStream,
  onHangUp,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
  cameraFacing,
  onEndTranscript,
}) => {
  const remoteRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const { user } = useAuth();
  const muted = !localStream?.getAudioTracks()[0]?.enabled;
  const timer = useCallTimer(Boolean(connectedAt), connectedAt);
  const myLabel = user?.name?.split(' ')[0] || 'You';
  const transcript = useCallTranscript(callId, {
    peerName: peerName.split(' ')[0] || peerName,
    myLabel,
    muted,
    mediaReady: Boolean(localStream && connectedAt),
  });
  const localSpeaking = useAudioSpeaking(localStream);
  const remoteSpeaking = useAudioSpeaking(remoteStream, 0.05);

  const cameraOff = !localStream?.getVideoTracks()[0]?.enabled;
  const showVideo = isVideo && (localStream || remoteStream);
  const isRingingOut = phase === 'ringing_out';
  const endLabel = isRingingOut ? 'Cancel call' : 'End call';

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    const activeCallId = callId;
    return () => {
      if (!activeCallId) return;
      void transcript.upload();
      transcript.reset();
      onEndTranscript?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup when this call ends
  }, [callId]);

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
  const connLabel = connectionLabel(connectionUi);
  const connGood = connectionUi === 'good';

  const content = (
    <div className={styles.backdrop}>
      {connectionUi === 'reconnecting' && (
        <output className={styles.reconnectBanner}>
          Reconnecting…
        </output>
      )}

      <div className={styles.header}>
        <UserAvatar
          userId={peerUserId}
          avatarUrl={peerAvatarUrl}
          displayName={peerName}
          className={`${styles.headerAvatar} ${remoteSpeaking && !remotePeerMuted ? styles.avatarSpeaking : ''}`}
          fallbackFontSize="1.25rem"
        />
        <div className={styles.headerText}>
          <div className={styles.headerTitleRow}>
            <span className={styles.headerTitle}>{peerName}</span>
            {remotePeerMuted && (
              <span className={styles.remoteMutedBadge} title="Remote muted">
                <MicOff size={14} aria-hidden />
              </span>
            )}
          </div>
          <div className={styles.headerSub}>
            {statusLabel}
            {connectedAt ? ` · ${timer}` : ''}
            <span
              className={`${styles.connBadge} ${connGood ? styles.connGood : styles.connWarn}`}
              title={connLabel}
            >
              {connGood ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connLabel}
            </span>
          </div>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`${styles.stage} ${showVideo ? styles.stageVideo : ''}`}
      >
        {showVideo && remoteStream ? (
          <video ref={remoteRef} className={styles.remoteVideo} autoPlay playsInline>
            <track kind="captions" />
          </video>
        ) : (
          <div className={styles.audioOnly}>
            <div className={styles.avatarWrap}>
              <UserAvatar
                userId={peerUserId}
                avatarUrl={peerAvatarUrl}
                displayName={peerName}
                className={`${styles.largeAvatar} ${remoteSpeaking && !remotePeerMuted ? styles.avatarSpeaking : ''}`}
                fallbackFontSize="2.5rem"
              />
              {remoteSpeaking && !remotePeerMuted && (
                <div className={styles.speakingRing} aria-hidden />
              )}
            </div>
            <span>{statusLabel}</span>
          </div>
        )}
        {showVideo && localStream && (
          <CallLocalPip
            variant="dm"
            stream={localStream}
            cameraOff={cameraOff}
            speaking={localSpeaking}
            cameraFacing={cameraFacing}
            stageRef={stageRef}
            label={myLabel}
            userId={user?.id}
            displayName={user?.name}
            email={user?.email}
          />
        )}
        {localSpeaking && !muted && (
          <div className={styles.localSpeakingBadge} aria-live="polite">
            <span className={styles.waveBar} />
            <span className={styles.waveBar} />
            <span className={styles.waveBar} />
            <span>{' '}You’re speaking</span>
          </div>
        )}
        <CallOverlayCaptions transcript={transcript} myLabel={myLabel} />
      </div>

      <CallOverlayControls
        muted={muted}
        cameraOff={cameraOff}
        isVideo={isVideo}
        speakerOn={speakerOn}
        supportsSink={supportsSink}
        endLabel={endLabel}
        transcript={transcript}
        onToggleMute={onToggleMute}
        onToggleCamera={onToggleCamera}
        onSwitchCamera={onSwitchCamera}
        onToggleSpeaker={toggleSpeaker}
        onHangUp={onHangUp}
      />
    </div>
  );

  return createPortal(content, document.body);
};

export default CallOverlay;
