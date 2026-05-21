import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Music, Pause, Play } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import MessageMeta from './MessageMeta';
import { buildFileUrl } from '../utils/fileUrl';
import { getMessageFiles } from '../utils/fileMeta';
import { truncateFilenameMiddle } from '../utils/formatFilename';
import { useDecryptedFileUrl } from '../../e2ee/useDecryptedFileUrl';
import { isE2eeMessage } from '../../e2ee/directChat';
import type { Message } from '../types';
import styles from './AudioFileAttachment.module.css';
import { formatMediaTimeRange } from '../utils/formatMediaTime';

type AudioFileAttachmentProps = {
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

let activeAudioEl: HTMLAudioElement | null = null;

const AudioFileAttachment: React.FC<AudioFileAttachmentProps> = ({
  contentMeta,
  e2eeMessage,
  transportMeta,
  bubbleVariant = 'received',
  mediaTimestamp,
}) => {
  const { token } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const files = getMessageFiles({ kind: 'FILE', contentMeta });
  const primary = files?.[0];
  const meta = contentMeta ?? {};
  const displayName =
    meta.originalName || meta.filename || primary?.originalName || primary?.filename || 'Audio';

  const fileRef = useMemo(
    () => ({
      filename: meta.filename ?? primary?.filename,
      url: meta.url ?? primary?.url,
      mimetype: meta.mimetype ?? primary?.mimetype,
      uploadId: meta.uploadId ?? primary?.uploadId,
      originalName: meta.originalName ?? primary?.originalName,
      attachment: primary?.attachment,
    }),
    [
      meta.filename,
      meta.url,
      meta.mimetype,
      meta.uploadId,
      meta.originalName,
      primary?.filename,
      primary?.url,
      primary?.mimetype,
      primary?.uploadId,
      primary?.originalName,
      primary?.attachment,
    ],
  );

  const decryptedUrl = useDecryptedFileUrl(e2eeMessage, fileRef, transportMeta);
  const fullUrl =
    e2eeMessage && isE2eeMessage(e2eeMessage) ? decryptedUrl : buildFileUrl(fileRef, token);

  const isSent = bubbleVariant === 'sent';
  const isLoading = Boolean(e2eeMessage && isE2eeMessage(e2eeMessage) && !fullUrl);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration > 0) {
        setProgress(audio.currentTime / audio.duration);
        setElapsedSec(audio.currentTime);
      }
    };
    const onLoaded = () => setDurationSec(audio.duration || 0);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setElapsedSec(0);
      if (activeAudioEl === audio) activeAudioEl = null;
    };
    const onPause = () => {
      setPlaying(false);
      setElapsedSec(audio.currentTime);
    };
    const onPlay = () => setPlaying(true);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, [fullUrl]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !fullUrl) return;

    if (playing) {
      audio.pause();
      return;
    }

    if (activeAudioEl && activeAudioEl !== audio) {
      activeAudioEl.pause();
      activeAudioEl.currentTime = 0;
    }
    activeAudioEl = audio;
    try {
      await audio.play();
    } catch {
      /* ignore autoplay restrictions */
    }
  }, [fullUrl, playing]);

  const timeLabel = useMemo(() => {
    if (isLoading) return 'Loading…';
    if (!durationSec) return '0:00 / 0:00';
    return formatMediaTimeRange(elapsedSec, durationSec);
  }, [isLoading, durationSec, elapsedSec]);

  if (!fullUrl && !isLoading) {
    return <div className={styles.unavailable}>Audio unavailable</div>;
  }

  return (
    <div className={`${styles.card} ${isSent ? styles.cardSent : styles.cardReceived}`}>
      <button
        type="button"
        className={styles.playBtn}
        onClick={() => void togglePlay()}
        disabled={!fullUrl}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={18} /> : <Play size={18} className={styles.playIcon} />}
      </button>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <Music size={14} className={styles.musicIcon} aria-hidden />
          <span className={styles.title} title={displayName}>
            {truncateFilenameMiddle(displayName, 28)}
          </span>
        </div>
        <div className={styles.progressTrack} aria-hidden>
          <span
            className={styles.progressFill}
            style={{ width: `${Math.max(progress * 100, playing ? 2 : 0)}%` }}
          />
        </div>
        <div className={styles.footer}>
          <span className={styles.duration}>{timeLabel}</span>
          {mediaTimestamp && (
            <MessageMeta
              createdAt={mediaTimestamp.createdAt}
              editedAt={mediaTimestamp.editedAt}
              isMe={mediaTimestamp.isMe}
              inline
              receiptStatus={mediaTimestamp.receiptStatus}
            />
          )}
        </div>
      </div>
      {fullUrl ? (
        <audio ref={audioRef} src={fullUrl} preload="metadata" className={styles.hiddenAudio} />
      ) : null}
    </div>
  );
};

export default AudioFileAttachment;
