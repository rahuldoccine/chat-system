import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useViewerModalLock } from '../hooks/useViewerModalLock';
import { createPortal } from 'react-dom';
import { Download, Loader2, Mic, Pause, Play, X } from 'lucide-react';
import styles from './ImageViewerModal.module.css';
import mediaStyles from './MediaPreviewModal.module.css';
import { downloadFileFromUrl } from '../utils/downloadFile';
import { VOICE_WAVE_BAR_COUNT, VOICE_WAVE_HEIGHTS } from '../utils/voiceWaveform';
import { formatMediaTimeRange } from '../utils/formatMediaTime';
import { handler } from '../../../utils/asyncHandler';
import { ModalDialog } from '../../../components/ModalDialog';

export type MediaPreviewModalProps = Readonly<{
  open: boolean;
  kind: 'video' | 'audio';
  src: string;
  title?: string;
  /** Known length from voice note / recording metadata when the blob has no duration yet. */
  durationMs?: number;
  onClose: () => void;
}>;

type ModalAudioPlayerProps = Readonly<{
  src: string;
  title: string;
  durationMs?: number;
}>;

const ModalAudioPlayer: React.FC<ModalAudioPlayerProps> = ({ src, title, durationMs }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [durationSec, setDurationSec] = useState(
    durationMs && durationMs > 0 ? durationMs / 1000 : 0,
  );
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const metaDurationSec = durationMs && durationMs > 0 ? durationMs / 1000 : 0;

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setElapsedSec(0);
    setDurationSec(metaDurationSec);
    setReady(false);
    setLoadError(false);
  }, [src, metaDurationSec]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const applyDuration = () => {
      const d = audio.duration;
      if (d && Number.isFinite(d) && d > 0) {
        setDurationSec(d);
        setReady(true);
        setLoadError(false);
        return;
      }
      if (metaDurationSec > 0) {
        setDurationSec(metaDurationSec);
        setReady(true);
      }
    };

    const onTimeUpdate = () => {
      const d =
        audio.duration && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : metaDurationSec;
      if (d > 0) {
        setProgress(audio.currentTime / d);
      }
      setElapsedSec(audio.currentTime);
    };

    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setElapsedSec(0);
    };

    const onPlay = () => setPlaying(true);

    const onPause = () => {
      setPlaying(false);
      setElapsedSec(audio.currentTime);
    };

    const onError = () => {
      setLoadError(true);
      setReady(metaDurationSec > 0);
    };

    audio.addEventListener('loadedmetadata', applyDuration);
    audio.addEventListener('durationchange', applyDuration);
    audio.addEventListener('loadeddata', applyDuration);
    audio.addEventListener('canplay', applyDuration);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);

    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', applyDuration);
      audio.removeEventListener('durationchange', applyDuration);
      audio.removeEventListener('loadeddata', applyDuration);
      audio.removeEventListener('canplay', applyDuration);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
    };
  }, [src, metaDurationSec]);

  const totalSec = durationSec > 0 ? durationSec : metaDurationSec;

  const playedBarCount = useMemo(
    () => Math.min(VOICE_WAVE_BAR_COUNT, Math.floor(progress * VOICE_WAVE_BAR_COUNT)),
    [progress],
  );

  const timeLabel = useMemo(() => {
    if (!ready && !totalSec) return 'Loading…';
    if (loadError && !totalSec) return 'Unavailable';
    return formatMediaTimeRange(elapsedSec, totalSec);
  }, [ready, elapsedSec, totalSec, loadError]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || loadError) return;
    if (playing) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      /* ignore */
    }
  }, [playing, loadError]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const audio = audioRef.current;
      const wave = waveRef.current;
      const d = totalSec;
      if (!audio || !wave || !d) return;
      const rect = wave.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      audio.currentTime = ratio * d;
      setProgress(ratio);
      setElapsedSec(audio.currentTime);
    },
    [totalSec],
  );

  const handleWavePointerDown = useCallback(
    (e: React.PointerEvent) => {
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

  return (
    <div className={mediaStyles.audioPlayer}>
      <p className={mediaStyles.audioTitle}>{title}</p>

      <div className={mediaStyles.audioCard}>
        <button
          type="button"
          className={mediaStyles.audioPlayBtn}
          onClick={handler(togglePlay)}
          disabled={!ready && !totalSec}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        >
          {(() => {
            if (!ready && !totalSec) {
              return <Loader2 size={22} className={mediaStyles.audioSpinner} />;
            }
            if (playing) {
              return <Pause size={22} fill="currentColor" strokeWidth={0} />;
            }
            return (
              <Play size={22} fill="currentColor" strokeWidth={0} className={mediaStyles.audioPlayIcon} />
            );
          })()}
        </button>

        <div className={mediaStyles.audioBody}>
          <div
            ref={waveRef}
            className={mediaStyles.waveArea}
            role="slider"
            aria-label="Playback position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            tabIndex={0}
            onPointerDown={handleWavePointerDown}
            onPointerMove={handleWavePointerMove}
            onKeyDown={(e) => {
              const audio = audioRef.current;
              if (!audio || !totalSec) return;
              const step = 0.05;
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                audio.currentTime = Math.min(totalSec, audio.currentTime + totalSec * step);
                setProgress(audio.currentTime / totalSec);
                setElapsedSec(audio.currentTime);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                audio.currentTime = Math.max(0, audio.currentTime - totalSec * step);
                setProgress(audio.currentTime / totalSec);
                setElapsedSec(audio.currentTime);
              }
            }}
          >
            <div className={mediaStyles.waveBars} aria-hidden>
              {VOICE_WAVE_HEIGHTS.map((heightPct, offset) => (
                <span
                  key={`${offset}:${heightPct}`}
                  className={`${mediaStyles.waveBar} ${offset < playedBarCount ? mediaStyles.waveBarPlayed : ''} ${
                    playing && offset === playedBarCount ? mediaStyles.waveBarActive : ''
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              ))}
            </div>
            <div className={mediaStyles.progressTrack} aria-hidden>
              <div
                className={mediaStyles.progressFill}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          <div className={mediaStyles.audioFooter}>
            <div className={mediaStyles.durationGroup}>
              <Mic size={14} strokeWidth={2.25} aria-hidden className={mediaStyles.micIcon} />
              <span className={mediaStyles.durationLabel} aria-live="polite">
                {timeLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="auto" className={mediaStyles.hiddenAudio}>
        <track kind="captions" />
      </audio>
    </div>
  );
};

const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  open,
  kind,
  src,
  title = 'Media',
  durationMs,
  onClose,
}) => {
  const [downloading, setDownloading] = useState(false);

  useViewerModalLock(open, onClose);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFileFromUrl(src, title);
    } finally {
      setDownloading(false);
    }
  }, [downloading, src, title]);

  if (!open) return null;

  return createPortal(
    <ModalDialog className={styles.overlay} aria-label={title} onClose={onClose}>
      <div className={styles.panel}>
        <div
          className={`${styles.stage} ${mediaStyles.stage} ${
            kind === 'audio' ? mediaStyles.stageAudio : mediaStyles.stageVideo
          }`}
        >
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={handler(handleDownload)}
              disabled={downloading}
              aria-label="Download"
            >
              {downloading ? <Loader2 size={20} className={styles.iconSpinner} /> : <Download size={20} />}
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>

          {kind === 'video' ? (
            <video
              className={mediaStyles.video}
              src={src}
              controls
              playsInline
              aria-label={title}
            >
              <track kind="captions" />
            </video>
          ) : (
            <ModalAudioPlayer src={src} title={title} durationMs={durationMs} />
          )}
        </div>
      </div>
    </ModalDialog>,
    document.body,
  );
};

export default MediaPreviewModal;
