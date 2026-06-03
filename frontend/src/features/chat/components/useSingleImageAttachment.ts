import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { buildFileUrl } from '../utils/fileUrl';
import { useDecryptedFileUrl } from '../../e2ee/useDecryptedFileUrl';
import { decryptMessageFile } from '../../e2ee/attachmentCrypto';
import { isE2eeMessage } from '../../e2ee/directChat';
import { downloadBlob, downloadFileFromUrl } from '../utils/downloadFile';
import type { ContentMeta, Message } from '../types';
import type { FileAttachmentMeta } from '../utils/fileMeta';

export type UseSingleImageAttachmentParams = {
  contentMeta: Message['contentMeta'];
  e2eeMessage?: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;
  transportMeta?: ContentMeta;
  onMediaLoad?: () => void;
  primaryFile?: FileAttachmentMeta;
};

export function useSingleImageAttachment({
  contentMeta,
  e2eeMessage,
  transportMeta,
  onMediaLoad,
  primaryFile,
}: UseSingleImageAttachmentParams) {
  const { user, token } = useAuth();
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const meta = contentMeta ?? {};
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

  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [fullUrl]);

  useEffect(() => {
    if (!fullUrl || imgError) return;
    if (imgRef.current?.complete) {
      setImgLoaded(true);
      onMediaLoad?.();
    }
  }, [fullUrl, imgError, onMediaLoad]);

  const mediaWidth = meta.width ?? primaryFile?.width;
  const mediaHeight = meta.height ?? primaryFile?.height;
  const isGif =
    (meta.mimetype ?? primaryFile?.mimetype ?? '').toLowerCase().includes('gif') ||
    displayName.toLowerCase().endsWith('.gif');
  const aspectRatio =
    !isGif && mediaWidth && mediaHeight && mediaWidth > 0 && mediaHeight > 0
      ? `${mediaWidth} / ${mediaHeight}`
      : undefined;

  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const openViewer = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setViewerOpen(true);
  }, []);

  const openViewerFromKeyboard = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setViewerOpen(true);
    }
  }, []);

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

  const onImageLoad = useCallback(() => {
    setImgLoaded(true);
    onMediaLoad?.();
  }, [onMediaLoad]);

  const showPlaceholder = Boolean(!fullUrl || (fullUrl && !imgLoaded && !imgError));
  const canOpenViewer = Boolean(fullUrl);
  const unavailable = !fullUrl && !primaryFile && !meta.filename;

  return {
    displayName,
    fullUrl,
    imgRef,
    imgError,
    imgLoaded,
    viewerOpen,
    overlayActive,
    setOverlayActive,
    isGif,
    aspectRatio,
    closeViewer,
    openViewer,
    openViewerFromKeyboard,
    handleDownload,
    onImageLoad,
    setImgError,
    showPlaceholder,
    canOpenViewer,
    unavailable,
  };
}
