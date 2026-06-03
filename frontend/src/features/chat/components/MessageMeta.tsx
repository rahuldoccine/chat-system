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

function receiptTickClass(status: NonNullable<MessageMetaProps['receiptStatus']>): string {
  if (status === 'read') return styles.ticksRead;
  if (status === 'delivered') return styles.ticksDelivered;
  return '';
}

function receiptAriaLabel(status: NonNullable<MessageMetaProps['receiptStatus']>): string {
  if (status === 'read') return 'Read';
  if (status === 'delivered') return 'Delivered';
  return 'Sent';
}

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
        className={`${styles.ticks} ${receiptTickClass(receiptStatus)}`}
        aria-label={receiptAriaLabel(receiptStatus)}
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
