import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import MessageMeta from './MessageMeta';
import { useAuth } from '../../../context/AuthContext';
import { buildFileUrl } from '../utils/fileUrl';
import { getMessageFiles, getVoiceDurationMs } from '../utils/fileMeta';
import type { Message } from '../types';
import styles from './VoiceAttachment.module.css';
import { VOICE_WAVE_BAR_COUNT, VOICE_WAVE_HEIGHTS } from '../utils/voiceWaveform';
import { formatMediaTimeRange } from '../utils/formatMediaTime';

type VoiceAttachmentProps = {
  contentMeta: Message['contentMeta'];
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
  bubbleVariant = 'received',
  mediaTimestamp,
}) => {
  const { token } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loadedDurationMs, setLoadedDurationMs] = useState<number | undefined>();

  const isSent = bubbleVariant === 'sent';

  const files = getMessageFiles({ kind: 'FILE', contentMeta });
  const primary = files?.[0];
  const meta = contentMeta ?? {};
  const voiceFile = primary ?? {
    url: meta.url,
    filename: meta.filename,
    mimetype: meta.mimetype,
    uploadId: meta.uploadId,
  };
  const fullUrl = buildFileUrl(voiceFile, token);

  const metaDurationMs = getVoiceDurationMs(meta);
  const totalDurationMs = metaDurationMs ?? loadedDurationMs ?? 0;

  const timeLabel = useMemo(() => {
    if (!totalDurationMs) return '0:00 / 0:00';
    const totalSec = totalDurationMs / 1000;
    let elapsedSec = 0;
    if (playing || progress > 0) {
      elapsedSec =
        elapsedMs > 0 ? elapsedMs / 1000 : (progress * totalDurationMs) / 1000;
    }
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
    <fieldset
      className={`${styles.card} ${isSent ? styles.cardSent : styles.cardReceived}`}
    >
      <legend className={styles.srOnly}>Voice message</legend>
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
            {VOICE_WAVE_HEIGHTS.map((heightPct, offset) => (
              <span
                key={`${offset}:${heightPct}`}
                className={`${styles.bar} ${offset < playedBarCount ? styles.barPlayed : ''} ${
                  playing && offset === playedBarCount ? styles.barActive : ''
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
      >
        <track kind="captions" />
      </audio>
    </fieldset>
  );
};

export default VoiceAttachment;
