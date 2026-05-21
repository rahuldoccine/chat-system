import React, { useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import MessageMeta from './MessageMeta';
import { buildFileUrl } from '../utils/fileUrl';
import { getMessageFiles } from '../utils/fileMeta';
import { useDecryptedFileUrl } from '../../e2ee/useDecryptedFileUrl';
import { isE2eeMessage } from '../../e2ee/directChat';
import type { Message } from '../types';
import styles from './VideoAttachment.module.css';

type VideoAttachmentProps = {
  contentMeta: Message['contentMeta'];
  e2eeMessage?: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;
  transportMeta?: Record<string, unknown>;
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
  e2eeMessage,
  transportMeta,
  embedded = false,
  bubbleVariant = 'received',
  onMediaLoad,
  mediaTimestamp,
}) => {
  const { token } = useAuth();
  const files = getMessageFiles({ kind: 'FILE', contentMeta });
  const primary = files?.[0];
  const meta = contentMeta ?? {};
  const displayName =
    meta.originalName || meta.filename || primary?.originalName || primary?.filename || 'Video';

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
      />
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
