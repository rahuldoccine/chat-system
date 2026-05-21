import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import MessageMeta from './MessageMeta';
import { buildFileUrl } from '../utils/fileUrl';
import { getMessageFiles, getVoiceDurationMs } from '../utils/fileMeta';
import {
  e2eeMessageDepKey,
  fileAttachmentDepKey,
  transportMetaDepKey,
} from '../../e2ee/attachmentDeps';
import { isE2eeMessage } from '../../e2ee/directChat';
import { decryptMessageFile } from '../../e2ee/attachmentCrypto';
import type { Message } from '../types';
import styles from './VoiceAttachment.module.css';
import { VOICE_WAVE_BAR_COUNT, VOICE_WAVE_HEIGHTS } from '../utils/voiceWaveform';
import { formatMediaTimeRange } from '../utils/formatMediaTime';

type VoiceAttachmentProps = {
  contentMeta: Message['contentMeta'];
  e2eeMessage?: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;
  transportMeta?: Record<string, unknown>;
  bubbleVariant?: 'sent' | 'received';
  mediaTimestamp?: {
    createdAt: string;
    editedAt?: string | null;
    isMe: boolean;
    receiptStatus?: 'sent' | 'delivered' | 'read';
  };
};

let activeVoiceAudio: HTMLAudioElement | null = null;

const VoiceAttachment: React.FC<VoiceAttachmentProps> = ({
  contentMeta,
  e2eeMessage,
  transportMeta,
  bubbleVariant = 'received',
  mediaTimestamp,
}) => {
  const { user, token } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loadedDurationMs, setLoadedDurationMs] = useState<number | undefined>();
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);

  const isSent = bubbleVariant === 'sent';

  const files = getMessageFiles({ kind: 'FILE', contentMeta });
  const primary = files?.[0];
  const meta = contentMeta ?? {};
  const voiceFile = primary ?? {
    url: meta.url,
    filename: meta.filename,
    mimetype: meta.mimetype,
    uploadId: meta.uploadId,
    attachment: primary?.attachment,
  };
  const remoteUrl = buildFileUrl(voiceFile, token);

  const messageKey = e2eeMessageDepKey(e2eeMessage);
  const fileKey = fileAttachmentDepKey(voiceFile);
  const transportKey = transportMetaDepKey(transportMeta);

  useEffect(() => {
    if (!e2eeMessage || !isE2eeMessage(e2eeMessage) || !user?.id) {
      setDecryptedUrl(null);
      return;
    }
    let cancelled = false;
    let revoke: string | null = null;
    void (async () => {
      const blob = await decryptMessageFile(
        user.id,
        e2eeMessage,
        voiceFile,
        user.id,
        token,
        transportMeta,
      );
      if (cancelled || !blob) return;
      revoke = URL.createObjectURL(blob);
      setDecryptedUrl(revoke);
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [messageKey, fileKey, transportKey, user?.id, token]);

  const fullUrl = decryptedUrl ?? remoteUrl;

  const metaDurationMs = getVoiceDurationMs(meta);
  const totalDurationMs = metaDurationMs ?? loadedDurationMs ?? 0;

  const timeLabel = useMemo(() => {
    if (!totalDurationMs) return '0:00 / 0:00';
    const totalSec = totalDurationMs / 1000;
    const elapsedSec =
      playing || progress > 0
        ? elapsedMs > 0
          ? elapsedMs / 1000
          : (progress * totalDurationMs) / 1000
        : 0;
    return formatMediaTimeRange(elapsedSec, totalSec);
  }, [playing, progress, elapsedMs, totalDurationMs]);

  const playedBarCount = useMemo(
    () => Math.min(VOICE_WAVE_BAR_COUNT, Math.floor(progress * VOICE_WAVE_BAR_COUNT)),
    [progress],
  );

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (activeVoiceAudio === audioRef.current) {
      activeVoiceAudio = null;
    }
    setPlaying(false);
    setProgress(0);
    setElapsedMs(0);
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const togglePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!fullUrl || !audioRef.current) return;

      if (playing) {
        stopPlayback();
        return;
      }

      if (activeVoiceAudio && activeVoiceAudio !== audioRef.current) {
        activeVoiceAudio.pause();
        activeVoiceAudio.currentTime = 0;
      }

      activeVoiceAudio = audioRef.current;
      void audioRef.current.play().then(() => setPlaying(true)).catch(() => {
        stopPlayback();
      });
    },
    [fullUrl, playing, stopPlayback],
  );

  const seekFromClientX = useCallback((clientX: number) => {
    const el = audioRef.current;
    const wave = waveRef.current;
    if (!el?.duration || !Number.isFinite(el.duration) || !wave) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * el.duration;
    const ms = Math.floor(el.currentTime * 1000);
    setProgress(ratio);
    setElapsedMs(ms);
  }, []);

  const handleWavePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      seekFromClientX(e.clientX);
      waveRef.current?.setPointerCapture(e.pointerId);
    },
    [seekFromClientX],
  );

  const handleWavePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.buttons !== 1) return;
      seekFromClientX(e.clientX);
    },
    [seekFromClientX],
  );

  if (!fullUrl) {
    return <div className={styles.unavailable}>Voice message unavailable</div>;
  }

  return (
    <div
      className={`${styles.card} ${isSent ? styles.cardSent : styles.cardReceived}`}
      role="group"
      aria-label="Voice message"
    >
      <button
        type="button"
        className={styles.playBtn}
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {playing ? (
          <Pause size={20} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={20} fill="currentColor" strokeWidth={0} className={styles.playIcon} />
        )}
      </button>

      <div className={styles.body}>
        <div
          ref={waveRef}
          className={styles.waveArea}
          role="slider"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onPointerDown={handleWavePointerDown}
          onPointerMove={handleWavePointerMove}
          onKeyDown={(e) => {
            const el = audioRef.current;
            if (!el?.duration) return;
            const step = 0.05;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              el.currentTime = Math.min(el.duration, el.currentTime + el.duration * step);
              setProgress(el.currentTime / el.duration);
              setElapsedMs(Math.floor(el.currentTime * 1000));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              el.currentTime = Math.max(0, el.currentTime - el.duration * step);
              setProgress(el.currentTime / el.duration);
              setElapsedMs(Math.floor(el.currentTime * 1000));
            }
          }}
        >
          <div className={styles.waveBars} aria-hidden>
            {VOICE_WAVE_HEIGHTS.map((heightPct, i) => (
              <span
                key={i}
                className={`${styles.bar} ${i < playedBarCount ? styles.barPlayed : ''} ${
                  playing && i === playedBarCount ? styles.barActive : ''
                }`}
                style={{ height: `${heightPct}%` }}
              />
            ))}
          </div>
          <div className={styles.progressTrack} aria-hidden>
            <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.durationGroup}>
            <Mic size={13} strokeWidth={2.25} aria-hidden className={styles.micIcon} />
            <span className={styles.durationLabel} aria-live="polite">
              {timeLabel}
            </span>
          </div>
          {mediaTimestamp && (
            <MessageMeta
              createdAt={mediaTimestamp.createdAt}
              editedAt={mediaTimestamp.editedAt}
              isMe={mediaTimestamp.isMe}
              receiptStatus={mediaTimestamp.receiptStatus}
              inline
            />
          )}
        </div>
      </div>

      <audio
        ref={audioRef}
        src={fullUrl}
        preload="metadata"
        className={styles.hiddenAudio}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && Number.isFinite(d)) {
            setLoadedDurationMs(Math.round(d * 1000));
          }
        }}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (!el?.duration || !Number.isFinite(el.duration)) return;
          setProgress(el.currentTime / el.duration);
          setElapsedMs(Math.floor(el.currentTime * 1000));
        }}
        onEnded={stopPlayback}
        onPause={() => {
          if (audioRef.current?.currentTime === 0) setPlaying(false);
        }}
      />
    </div>
  );
};

export default VoiceAttachment;
