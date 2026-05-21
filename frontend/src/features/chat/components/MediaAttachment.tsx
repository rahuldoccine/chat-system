import React, { useCallback, useMemo, useState } from 'react';
import styles from './MediaAttachment.module.css';
import { Download, ImageIcon } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import ImageViewerModal from './ImageViewerModal';
import MessageMeta from './MessageMeta';
import { downloadFileFromUrl } from '../utils/downloadFile';
import { getMessageFiles, isVoiceMessage, isVideoFile, isAudioFile, shouldUseGroupedFileLayout } from '../utils/fileMeta';
import GroupedFileAttachments from './GroupedFileAttachments';
import VoiceAttachment from './VoiceAttachment';
import VideoAttachment from './VideoAttachment';
import AudioFileAttachment from './AudioFileAttachment';
import { buildFileUrl } from '../utils/fileUrl';
import { useDecryptedFileUrl } from '../../e2ee/useDecryptedFileUrl';
import { decryptMessageFile } from '../../e2ee/attachmentCrypto';
import { isE2eeMessage } from '../../e2ee/directChat';
import { downloadBlob } from '../utils/downloadFile';
import type { Message } from '../types';

interface MediaAttachmentProps {
  kind: string;
  contentMeta: Message['contentMeta'];
  e2eeMessage?: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;
  transportMeta?: Record<string, unknown>;
  onMediaLoad?: () => void;
  embedded?: boolean;
  caption?: string;
  bubbleVariant?: 'sent' | 'received';
  mediaTimestamp?: {
    createdAt: string;
    editedAt?: string | null;
    isMe: boolean;
    receiptStatus?: 'sent' | 'delivered' | 'read';
  };
}

const MediaAttachment: React.FC<MediaAttachmentProps> = ({
  kind,
  contentMeta,
  e2eeMessage,
  transportMeta,
  onMediaLoad,
  embedded = false,
  caption,
  bubbleVariant = 'received',
  mediaTimestamp,
}) => {
  const messageRef = { kind: kind as Message['kind'], contentMeta };

  if (isVoiceMessage(messageRef)) {
    return (
      <VoiceAttachment
        contentMeta={contentMeta}
        e2eeMessage={e2eeMessage}
        transportMeta={transportMeta}
        bubbleVariant={bubbleVariant}
        mediaTimestamp={mediaTimestamp}
      />
    );
  }

  const files = getMessageFiles(messageRef);

  if (files?.length === 1 && isVideoFile(files[0])) {
    return (
      <VideoAttachment
        contentMeta={contentMeta}
        e2eeMessage={e2eeMessage}
        transportMeta={transportMeta}
        embedded={embedded}
        bubbleVariant={bubbleVariant}
        onMediaLoad={onMediaLoad}
        mediaTimestamp={mediaTimestamp}
      />
    );
  }

  if (files?.length === 1 && isAudioFile(files[0])) {
    return (
      <AudioFileAttachment
        contentMeta={contentMeta}
        e2eeMessage={e2eeMessage}
        transportMeta={transportMeta}
        bubbleVariant={bubbleVariant}
        mediaTimestamp={mediaTimestamp}
      />
    );
  }

  if (files && shouldUseGroupedFileLayout(messageRef)) {
    return (
      <GroupedFileAttachments
        files={files}
        e2eeMessage={e2eeMessage}
        transportMeta={transportMeta}
        embedded={embedded}
        caption={caption}
        bubbleVariant={bubbleVariant}
        mediaTimestamp={mediaTimestamp}
      />
    );
  }

  const { user, token } = useAuth();
  const [imgError, setImgError] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const openViewer = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setViewerOpen(true);
  }, []);

  const meta = contentMeta ?? {};
  const primaryFile = files?.[0];
  const displayName =
    meta.originalName || meta.filename || primaryFile?.originalName || primaryFile?.filename || 'Attachment';
  const fileRef = useMemo(
    () => ({
      filename: meta.filename ?? primaryFile?.filename,
      url: meta.url ?? primaryFile?.url,
      mimetype: meta.mimetype ?? primaryFile?.mimetype,
      uploadId: meta.uploadId ?? primaryFile?.uploadId,
      originalName: meta.originalName ?? primaryFile?.originalName,
      attachment: primaryFile?.attachment,
    }),
    [
      meta.filename,
      meta.url,
      meta.mimetype,
      meta.uploadId,
      meta.originalName,
      primaryFile?.filename,
      primaryFile?.url,
      primaryFile?.mimetype,
      primaryFile?.uploadId,
      primaryFile?.originalName,
      primaryFile?.attachment,
    ],
  );
  const decryptedUrl = useDecryptedFileUrl(e2eeMessage, fileRef, transportMeta);
  const fullUrl =
    e2eeMessage && isE2eeMessage(e2eeMessage) ? decryptedUrl : buildFileUrl(fileRef, token);
  const mediaWidth = meta.width ?? primaryFile?.width;
  const mediaHeight = meta.height ?? primaryFile?.height;
  const isGif =
    (meta.mimetype ?? primaryFile?.mimetype ?? '').toLowerCase().includes('gif') ||
    displayName.toLowerCase().endsWith('.gif');
  const aspectRatio =
    !isGif && mediaWidth && mediaHeight && mediaWidth > 0 && mediaHeight > 0
      ? `${mediaWidth} / ${mediaHeight}`
      : undefined;

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        if (e2eeMessage && isE2eeMessage(e2eeMessage) && user?.id && primaryFile) {
          const blob = await decryptMessageFile(
            user.id,
            e2eeMessage,
            fileRef,
            user.id,
            token,
            transportMeta,
          );
          if (blob) downloadBlob(blob, displayName);
          return;
        }
        if (!fullUrl) return;
        await downloadFileFromUrl(fullUrl, displayName);
      } catch {
        /* ignore */
      }
    },
    [displayName, e2eeMessage, fileRef, fullUrl, primaryFile, token, transportMeta, user?.id],
  );

  if (!fullUrl) {
    return <div className={styles.imageError}>Image unavailable</div>;
  }

  return (
    <>
      <div
        className={`${styles.imageContainer} ${embedded ? styles.imageContainerEmbedded : ''} ${
          viewerOpen ? styles.imageContainerViewerOpen : ''
        }`}
        style={!embedded && aspectRatio ? { aspectRatio } : undefined}
        onClick={openViewer}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setViewerOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${displayName}`}
      >
        {!imgError ? (
          <img
            src={fullUrl}
            alt={displayName}
            className={`${styles.image} ${embedded ? styles.imageEmbedded : ''} ${
              isGif ? styles.imageGif : ''
            }`}
            crossOrigin="anonymous"
            onLoad={onMediaLoad}
            onError={() => setImgError(true)}
            draggable={false}
          />
        ) : (
          <button type="button" className={styles.imageError} onClick={openViewer}>
            <ImageIcon size={20} />
            <span>View image</span>
          </button>
        )}
        {!imgError && (
          <div className={styles.imageOverlay}>
            <span className={styles.imageName}>{displayName}</span>
            <button
              type="button"
              className={styles.imageAction}
              onClick={handleDownload}
              aria-label={`Download ${displayName}`}
            >
              <Download size={16} />
            </button>
          </div>
        )}
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
      <ImageViewerModal open={viewerOpen} src={fullUrl} alt={displayName} onClose={closeViewer} />
    </>
  );
};

export default MediaAttachment;
