import React from 'react';
import { Pencil, Reply, X } from 'lucide-react';
import LiveUserName from './LiveUserName';
import type { Message } from '../types';
import styles from './MessageComposer.module.css';

export type MessageComposerReplyBarsProps = {
  editingMessage: { id: string; text: string } | null;
  setEditingMessage: (v: null) => void;
  isThread: boolean;
  replyTarget: Message | undefined;
  replyPreviewText: string;
  setReplyingTo: (v: null) => void;
  threadReplyTarget: Message | undefined;
  threadReplyPreviewText: string;
  setThreadReplyingTo: (v: null) => void;
};

const MessageComposerReplyBars: React.FC<MessageComposerReplyBarsProps> = ({
  editingMessage,
  setEditingMessage,
  isThread,
  replyTarget,
  replyPreviewText,
  setReplyingTo,
  threadReplyTarget,
  threadReplyPreviewText,
  setThreadReplyingTo,
}) => (
  <>
    {editingMessage ? (
      <div className={styles.replyBar}>
        <div className={styles.replyInfo}>
          <Pencil size={14} className={styles.replyIcon} />
          <div className={styles.replyContent}>
            <span className={styles.replyLabel}>Editing message</span>
          </div>
        </div>
        <button className={styles.closeReply} onClick={() => setEditingMessage(null)} type="button">
          <X size={16} />
        </button>
      </div>
    ) : null}
    {replyTarget && !isThread ? (
      <div className={styles.replyBar}>
        <div className={styles.replyInfo}>
          <Reply size={14} className={styles.replyIcon} />
          <div className={styles.replyContent}>
            <span className={styles.replyLabel}>
              Replying to{' '}
              <LiveUserName
                userId={replyTarget.senderId}
                displayName={replyTarget.sender?.displayName}
                email={replyTarget.sender?.email}
              />
            </span>
            <p className={styles.replyText}>{replyPreviewText}</p>
          </div>
        </div>
        <button className={styles.closeReply} onClick={() => setReplyingTo(null)} type="button">
          <X size={16} />
        </button>
      </div>
    ) : null}
    {threadReplyTarget && !editingMessage && isThread ? (
      <div className={styles.replyBar}>
        <div className={styles.replyInfo}>
          <Reply size={14} className={styles.replyIcon} />
          <div className={styles.replyContent}>
            <span className={styles.replyLabel}>
              Replying to{' '}
              <LiveUserName
                userId={threadReplyTarget.senderId}
                displayName={threadReplyTarget.sender?.displayName}
                email={threadReplyTarget.sender?.email}
              />
            </span>
            <p className={styles.replyText}>{threadReplyPreviewText}</p>
          </div>
        </div>
        <button className={styles.closeReply} onClick={() => setThreadReplyingTo(null)} type="button">
          <X size={16} />
        </button>
      </div>
    ) : null}
  </>
);

export default MessageComposerReplyBars;
