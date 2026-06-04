import React, { useEffect, useRef } from 'react';

type GroupCallRemoteVideoProps = Readonly<{
  stream: MediaStream;
  className?: string;
}>;

const GroupCallRemoteVideo: React.FC<GroupCallRemoteVideoProps> = ({ stream, className }) => {
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

  return <video ref={ref} className={className} autoPlay playsInline />;
};

export default GroupCallRemoteVideo;
