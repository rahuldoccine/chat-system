import React, { useEffect, useRef } from 'react';
import styles from './RemoteMediaPlayback.module.css';

type RemoteMediaPlaybackProps = Readonly<{
  stream: MediaStream | null;
  mode: 'video' | 'audio';
  className?: string;
  mediaRef?: React.Ref<HTMLVideoElement | HTMLAudioElement | null>;
}>;

const RemoteMediaPlayback: React.FC<RemoteMediaPlaybackProps> = ({
  stream,
  mode,
  className,
  mediaRef,
}) => {
  const internalRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const ref = (mediaRef as React.RefObject<HTMLVideoElement | HTMLAudioElement | null>) ?? internalRef;

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {});
    return () => {
      if (el.srcObject === stream) {
        el.srcObject = null;
      }
    };
  }, [stream, ref]);

  if (!stream) return null;

  if (mode === 'video') {
    return (
      <video
        ref={ref as React.RefObject<HTMLVideoElement>}
        className={className}
        autoPlay
        playsInline
      />
    );
  }

  return (
    <audio
      ref={ref as React.RefObject<HTMLAudioElement>}
      className={styles.hidden}
      autoPlay
      playsInline
    />
  );
};

export default RemoteMediaPlayback;
