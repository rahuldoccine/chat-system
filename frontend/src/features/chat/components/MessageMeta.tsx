import React from 'react';
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import styles from './MessageMeta.module.css';

type MessageMetaProps = {
  createdAt: string;
  editedAt?: string | null;
  isMe: boolean;
  receiptStatus?: 'sent' | 'delivered' | 'read';
  /** Local send state (optimistic / outbox). */
  sendStatus?: 'sending' | 'sent' | 'error';
  /** Inside media timestamp pill - use inherited light text. */
  onMedia?: boolean;
  /** Voice note footer - no extra left margin. */
  inline?: boolean;
};

const formatMessageTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const MessageMeta: React.FC<MessageMetaProps> = ({
  createdAt,
  editedAt,
  isMe,
  receiptStatus,
  sendStatus,
  onMedia = false,
  inline = false,
}) => (
  <span
    className={`${styles.meta} ${isMe ? styles.metaMe : ''} ${onMedia ? styles.metaOnMedia : ''} ${
      inline ? styles.metaInline : ''
    }`}
  >
    {editedAt && <span className={styles.edited}>edited</span>}
    <span className={styles.time}>{formatMessageTime(createdAt)}</span>
    {isMe && sendStatus === 'sending' && (
      <span className={styles.pending} aria-label="Sending">
        <Clock size={14} strokeWidth={2} />
      </span>
    )}
    {isMe && sendStatus === 'error' && (
      <span className={styles.failed} aria-label="Failed to send">
        <AlertCircle size={14} strokeWidth={2} />
      </span>
    )}
    {isMe && !sendStatus && receiptStatus && (
      <span
        className={`${styles.ticks} ${
          receiptStatus === 'read'
            ? styles.ticksRead
            : receiptStatus === 'delivered'
              ? styles.ticksDelivered
              : ''
        }`}
        aria-label={
          receiptStatus === 'read'
            ? 'Read'
            : receiptStatus === 'delivered'
              ? 'Delivered'
              : 'Sent'
        }
      >
        {receiptStatus === 'sent' ? (
          <Check size={14} strokeWidth={2.5} />
        ) : (
          <CheckCheck size={14} strokeWidth={2.5} />
        )}
      </span>
    )}
  </span>
);

export default MessageMeta;
