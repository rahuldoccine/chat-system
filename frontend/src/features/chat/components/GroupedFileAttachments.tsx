import React, { useCallback, useState } from 'react';
import styles from './GroupedFileAttachments.module.css';
import { handler } from '../../../utils/asyncHandler';
import { ChevronDown, CloudDownload, Download, Eye, ImageIcon, Loader2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { buildFileUrl } from '../utils/fileUrl';
import { downloadFileFromUrl } from '../utils/downloadFile';
import type { Message } from '../types';
import { getDocumentViewerKind, type DocumentViewerKind } from '../utils/documentViewer';
import { truncateFilenameMiddle } from '../utils/formatFilename';
import {
  getFileTypeBadge,
  getFileTypeLabel,
  getVoiceDurationMs,
  isImageFile,
  isVideoFile,
  isAudioFile,
  type FileAttachmentMeta,
} from '../utils/fileMeta';
import imageStyles from './MediaAttachment.module.css';
import DocumentViewerModal from './DocumentViewerModal';
import ImageViewerModal from './ImageViewerModal';
import MediaPreviewModal from './MediaPreviewModal';
import MessageMeta from './MessageMeta';

type GroupedFileAttachmentsProps = Readonly<{
  files: FileAttachmentMeta[];
  contentMeta?: Message['contentMeta'];
  embedded?: boolean;
  caption?: string;
  bubbleVariant?: 'sent' | 'received';
  mediaTimestamp?: {
    createdAt: string;
    editedAt?: string | null;
    isMe: boolean;
    receiptStatus?: 'sent' | 'delivered' | 'read';
  };
}>;

function SingleImagePreview({
  file,
  name,
  onOpen,
}: Readonly<{
  file: FileAttachmentMeta;
  name: string;
  onOpen: () => void;
}>) {
  const { token } = useAuth();
  const src = buildFileUrl(file, token);
  if (!src) {
    return (
      <div className={`${styles.singleImageBtn} ${imageStyles.imageError}`}>
        <ImageIcon size={20} />
        <span>Image unavailable</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${styles.singleImageBtn} ${imageStyles.imageContainer} ${imageStyles.imageContainerEmbedded}`}
      onClick={onOpen}
      aria-label={`Open ${name}`}
    >
      <img
        src={src}
        alt={name}
        className={`${imageStyles.image} ${imageStyles.imageEmbedded}`}
        loading="lazy"
        draggable={false}
      />
    </button>
  );
}

type ActiveViewer =
  | { kind: 'image'; src: string; title: string }
  | { kind: 'document'; src: string; title: string; docKind: DocumentViewerKind }
  | { kind: 'video'; src: string; title: string }
  | { kind: 'audio'; src: string; title: string; durationMs?: number }
  | null;

type FileCardProps = Readonly<{
  file: FileAttachmentMeta;
  layout: 'row' | 'grid';
  onView: (file: FileAttachmentMeta) => void;
  onDownload: (file: FileAttachmentMeta) => void;
  downloading?: boolean;
}>;

function fileKey(file: FileAttachmentMeta, index: number): string {
  return `${file.uploadId ?? file.filename ?? file.originalName ?? 'file'}-${index}`;
}

function badgeStyleClass(className: string): string {
  switch (className) {
    case 'badgePdf':
      return styles.badgePdf;
    case 'badgeWord':
      return styles.badgeWord;
    case 'badgeSheet':
      return styles.badgeSheet;
    case 'badgeImage':
      return styles.badgeImage;
    case 'badgeVideo':
      return styles.badgeVideo;
    case 'badgeAudio':
      return styles.badgeAudio;
    default:
      return styles.badgeDefault;
  }
}

function FileAttachmentCard({
  file,
  layout,
  onView,
  onDownload,
  downloading = false,
}: FileCardProps) {
  const name = file.originalName || file.filename || 'File';
  const badge = getFileTypeBadge(file.mimetype, name);
  const isImage = isImageFile(file);
  const canPreview =
    isImage ||
    isVideoFile(file) ||
    isAudioFile(file) ||
    Boolean(getDocumentViewerKind(file.mimetype, name));
  const isRow = layout === 'row';
  const displayName = truncateFilenameMiddle(name, isRow ? 44 : 22);
  const typeLabel = getFileTypeLabel(file.mimetype, name);

  return (
    <div className={isRow ? styles.fileCardRow : styles.fileCardGrid}>
      <div className={styles.fileMain}>
        <span className={`${styles.badge} ${badgeStyleClass(badge.className)}`}>
          {isImage ? (
            <ImageIcon size={isRow ? 18 : 20} strokeWidth={2.25} aria-hidden />
          ) : (
            badge.letter
          )}
        </span>
        <span className={styles.fileInfo}>
          <span
            className={`${styles.fileName} ${styles.fileNameRow}`}
            title={name}
          >
            {displayName}
          </span>
          <span className={styles.fileType} title={typeLabel}>
            {typeLabel}
          </span>
        </span>
      </div>
      <div className={styles.fileActions}>
        {canPreview && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onView(file)}
            aria-label={`View ${name}`}
            title={`View ${name}`}
          >
            <Eye size={16} />
          </button>
        )}
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => onDownload(file)}
          disabled={downloading}
          aria-label={`Download ${name}`}
          title={`Download ${name}`}
        >
          {downloading ? (
            <Loader2 size={16} className={styles.spinner} />
          ) : (
            <Download size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

const GroupedFileAttachments: React.FC<GroupedFileAttachmentsProps> = ({
  files,
  contentMeta,
  embedded = false,
  caption,
  bubbleVariant = 'received',
  mediaTimestamp,
}) => {
  const { token } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ActiveViewer>(null);

  const isMulti = files.length > 1;
  const captionText = caption?.trim();
  const isSent = bubbleVariant === 'sent';

  const resolveViewUrl = useCallback(
    (file: FileAttachmentMeta): string | null => {
      return buildFileUrl(file, token) || null;
    },
    [token],
  );

  const handleDownloadAll = useCallback(async () => {
    if (downloadingAll) return;
    setDownloadingAll(true);
    try {
      for (const file of files) {
        const name = file.originalName || file.filename || 'file';
        const url = buildFileUrl(file, token);
        if (!url) continue;
        await downloadFileFromUrl(url, name);
      }
    } finally {
      setDownloadingAll(false);
    }
  }, [downloadingAll, files, token]);

  const openFile = useCallback(
    (file: FileAttachmentMeta) => {
      const title = file.originalName || file.filename || 'File';
      const url = resolveViewUrl(file);
      if (!url) return;

      const isImage = isImageFile(file);
      if (isImage) {
        setViewer({ kind: 'image', src: url, title });
        return;
      }

      if (isVideoFile(file)) {
        setViewer({ kind: 'video', src: url, title });
        return;
      }

      if (isAudioFile(file)) {
        const durationMs = getVoiceDurationMs(contentMeta);
        setViewer({ kind: 'audio', src: url, title, durationMs });
        return;
      }

      const docKind = getDocumentViewerKind(file.mimetype, title);
      if (docKind) {
        setViewer({ kind: 'document', src: url, title, docKind });
      }
    },
    [contentMeta, resolveViewUrl],
  );

  const handleDownloadFile = useCallback(
    async (file: FileAttachmentMeta, index: number) => {
      const key = fileKey(file, index);
      if (downloadingKey) return;
      const name = file.originalName || file.filename || 'file';
      setDownloadingKey(key);
      try {
        const url = buildFileUrl(file, token);
        if (!url) return;
        await downloadFileFromUrl(url, name);
      } finally {
        setDownloadingKey(null);
      }
    },
    [downloadingKey, token],
  );

  if (files.length === 0) return null;

  const singleImage = !isMulti && isImageFile(files[0]);
  const singleImageName = files[0].originalName || files[0].filename || 'Image';

  const renderFileList = () => {
    if (isMulti && collapsed) return null;
    if (singleImage) {
      return (
        <SingleImagePreview
          file={files[0]}
          name={singleImageName}
          onOpen={() => openFile(files[0])}
        />
      );
    }
    if (isMulti) {
      return (
        <div className={styles.grid}>
          {files.map((file, index) => (
            <FileAttachmentCard
              key={fileKey(file, index)}
              file={file}
              layout="grid"
              onView={openFile}
              onDownload={handler(() => handleDownloadFile(file, index))}
              downloading={downloadingKey === fileKey(file, index)}
            />
          ))}
        </div>
      );
    }
    return (
      <FileAttachmentCard
        file={files[0]}
        layout="row"
        onView={openFile}
        onDownload={handler(() => handleDownloadFile(files[0], 0))}
        downloading={downloadingKey === fileKey(files[0], 0)}
      />
    );
  };

  return (
    <>
      <div
        className={`${styles.wrap} ${embedded ? styles.wrapEmbedded : ''} ${
          isSent ? styles.wrapSent : ''
        } ${isMulti ? styles.wrapMulti : styles.wrapSingle}`}
      >
        {captionText && <p className={styles.caption}>{captionText}</p>}

        {isMulti && (
          <div className={styles.header}>
            <button
              type="button"
              className={styles.countBtn}
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
            >
              <span>
                {files.length} files
              </span>
              <ChevronDown size={16} className={collapsed ? styles.chevronCollapsed : ''} />
            </button>
            <button
              type="button"
              className={styles.downloadAllBtn}
              onClick={handler(handleDownloadAll)}
              disabled={downloadingAll}
            >
              {downloadingAll ? (
                <Loader2 size={16} className={styles.spinner} />
              ) : (
                <CloudDownload size={16} />
              )}
              Download all
            </button>
          </div>
        )}

        {renderFileList()}

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

      {viewer?.kind === 'image' && (
        <ImageViewerModal
          open
          src={viewer.src}
          alt={viewer.title}
          onClose={() => setViewer(null)}
        />
      )}
      {viewer?.kind === 'document' && (
        <DocumentViewerModal
          open
          src={viewer.src}
          title={viewer.title}
          kind={viewer.docKind}
          onClose={() => setViewer(null)}
        />
      )}
      {(viewer?.kind === 'video' || viewer?.kind === 'audio') && (
        <MediaPreviewModal
          open
          kind={viewer.kind}
          src={viewer.src}
          title={viewer.title}
          durationMs={viewer.kind === 'audio' ? viewer.durationMs : undefined}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
};

export default GroupedFileAttachments;
