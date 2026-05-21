import React from 'react';
import { Phone, PhoneIncoming, PhoneMissed, Video } from 'lucide-react';
import type { CallContentMeta } from '../types';
import styles from './CallMessageBubble.module.css';

type CallMessageBubbleProps = {
  call: CallContentMeta;
  ciphertext: string | null;
  isMe: boolean;
  myUserId: string;
  onRedial?: () => void;
};

const CallMessageBubble: React.FC<CallMessageBubbleProps> = ({
  call,
  ciphertext,
  isMe,
  myUserId,
  onRedial,
}) => {
  const outgoing = call.initiatorId === myUserId;
  const missed = call.status === 'missed';
  const isVideo = call.kind === 'VIDEO';
  const Icon = missed ? PhoneMissed : isVideo ? Video : outgoing ? Phone : PhoneIncoming;
  const canRedial = call.status === 'completed' || call.status === 'cancelled';

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.pill} ${missed ? styles.missed : ''}`}
        onClick={canRedial ? onRedial : undefined}
        disabled={!canRedial || !onRedial}
        title={canRedial && onRedial ? 'Tap to call again' : undefined}
      >
        <Icon size={16} aria-hidden />
        <span>{ciphertext ?? (missed ? 'Missed call' : 'Call')}</span>
        {!isMe && missed && <span className={styles.badge}>Missed</span>}
      </button>
    </div>
  );
};

export default CallMessageBubble;

function isCallContentMeta(meta: unknown): meta is { call: CallContentMeta } {
  if (!meta || typeof meta !== 'object') return false;
  const call = (meta as { call?: unknown }).call;
  return Boolean(call && typeof call === 'object' && (call as CallContentMeta).callId);
}

export function getCallFromMessageMeta(contentMeta: unknown): CallContentMeta | null {
  if (!isCallContentMeta(contentMeta)) return null;
  return contentMeta.call;
}
