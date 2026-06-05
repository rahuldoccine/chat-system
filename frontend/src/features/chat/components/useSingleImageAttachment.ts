import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { buildFileUrl } from '../utils/fileUrl';
import { downloadFileFromUrl } from '../utils/downloadFile';
import type { Message } from '../types';
import type { FileAttachmentMeta } from '../utils/fileMeta';

export type UseSingleImageAttachmentParams = {
  contentMeta: Message['contentMeta'];
  onMediaLoad?: () => void;
  primaryFile?: FileAttachmentMeta;
};

export function useSingleImageAttachment({
  contentMeta,
  onMediaLoad,
  primaryFile,
}: UseSingleImageAttachmentParams) {
  const { token } = useAuth();
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
    ],
  );

  const fullUrl = buildFileUrl(fileRef, token);

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
        if (!fullUrl) return;
        await downloadFileFromUrl(fullUrl, displayName);
      } catch {
        /* ignore */
      }
    },
    [displayName, fullUrl],
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
