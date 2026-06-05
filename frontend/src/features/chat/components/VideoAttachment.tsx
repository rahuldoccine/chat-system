import React from 'react';
import MessageMeta from './MessageMeta';
import { useMessageFileSource } from '../hooks/useMessageFileSource';
import type { Message } from '../types';
import styles from './VideoAttachment.module.css';

type VideoAttachmentProps = {
  contentMeta: Message['contentMeta'];
  embedded?: boolean;
  bubbleVariant?: 'sent' | 'received';
  onMediaLoad?: () => void;
  mediaTimestamp?: {
    createdAt: string;
    editedAt?: string | null;
    isMe: boolean;
    receiptStatus?: 'sent' | 'delivered' | 'read';
  };
};

const VideoAttachment: React.FC<VideoAttachmentProps> = ({
  contentMeta,
  embedded = false,
  bubbleVariant = 'received',
  onMediaLoad,
  mediaTimestamp,
}) => {
  const { displayName, fullUrl } = useMessageFileSource(contentMeta, 'Video');

  if (!fullUrl) {
    return <div className={styles.unavailable}>Video unavailable</div>;
  }

  return (
    <div
      className={`${styles.wrap} ${embedded ? styles.wrapEmbedded : ''} ${
        bubbleVariant === 'sent' ? styles.wrapSent : styles.wrapReceived
      }`}
    >
      <video
        className={styles.video}
        src={fullUrl}
        controls
        playsInline
        preload="metadata"
        aria-label={displayName}
        onLoadedMetadata={onMediaLoad}
      >
        <track kind="captions" />
      </video>
      {mediaTimestamp && (
        <div className={styles.mediaTimestamp}>
          <MessageMeta
            createdAt={mediaTimestamp.createdAt}
            editedAt={mediaTimestamp.editedAt}
            isMe={mediaTimestamp.isMe}
            onMedia
            receiptStatus={mediaTimestamp.receiptStatus}
          />
        </div>
      )}
    </div>
  );
};

export default VideoAttachment;
