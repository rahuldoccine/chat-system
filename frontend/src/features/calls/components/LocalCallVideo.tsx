import React, { useEffect, useRef } from 'react';

type LocalCallVideoProps = Readonly<{
  stream: MediaStream | null;
  className?: string;
  mirrored?: boolean;
}>;

/** Attach local MediaStream once — avoids flicker from callback refs on parent re-renders. */
const LocalCallVideo: React.FC<LocalCallVideoProps> = ({ stream, className, mirrored = true }) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {});
    return () => {
      if (el.srcObject === stream) {
        el.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      playsInline
      muted
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
};

export default LocalCallVideo;
