import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { handler } from '../../../utils/asyncHandler';
import panelStyles from './ChatPanel.module.css';
import styles from './ChatFilesPanel.module.css';
import { Search, Image as ImageIcon, Loader2, ExternalLink, Eye, Download } from 'lucide-react';
import { useMessages } from '../hooks/useChatData';
import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import type { ContentMeta, Message } from '../types';
import { formatChatTimestamp } from '../../../utils/timeFormat';
import ImageViewerModal from './ImageViewerModal';
import DocumentViewerModal from './DocumentViewerModal';
import MediaPreviewModal from './MediaPreviewModal';
import { truncateFilenameMiddle } from '../utils/formatFilename';
import { getDocumentViewerKind, type DocumentViewerKind } from '../utils/documentViewer';
import {
  getMessageFiles,
  getFileTypeBadge,
  getVoiceDurationMs,
  isImageFile,
  isVideoFile,
  isAudioFile,
  isVoiceMessage,
  type FileAttachmentMeta,
} from '../utils/fileMeta';
import { useMessageBodies, messageWithDecryptedMeta } from '../../e2ee/useMessageBodies';
import { isE2eeMessage } from '../../e2ee/directChat';
import { useDecryptedFileUrl } from '../../e2ee/useDecryptedFileUrl';
import { downloadMessageFile, resolveFileAccessUrl } from '../utils/resolveFileAccess';

type MediaListItem = {
  key: string;
  message: Message;
  file: FileAttachmentMeta;
  category: 'image' | 'document';
  transportMeta?: ContentMeta;
};

function expandMessagesToMediaItems(
  messages: Message[],
  decryptedBodies: ReturnType<typeof useMessageBodies>,
): MediaListItem[] {
  const items: MediaListItem[] = [];

  for (const raw of messages) {
    if (raw.deletedAt) continue;
    const message = messageWithDecryptedMeta(raw, decryptedBodies);
    const files = getMessageFiles(message);
    if (!files?.length) continue;

    const transportMeta = message.contentMeta;

    files.forEach((file, index) => {
      const key = `${message.id}-${file.uploadId ?? file.filename ?? file.originalName ?? index}`;
      items.push({
        key,
        message,
        file,
        transportMeta,
        category: isImageFile(file) ? 'image' : 'document',
      });
    });
  }

  return items.sort(
    (a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime(),
  );
}

const DOCUMENTS_PAGE_SIZE = 5;

function fileBadgeClass(className: string): string {
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

type FilesPanelImageCardProps = {
  message: Message;
  file: FileAttachmentMeta;
  transportMeta?: ContentMeta;
  onOpen: (src: string, alt: string) => void;
};

const FilesPanelImageCard: React.FC<FilesPanelImageCardProps> = ({
  message,
  file,
  transportMeta,
  onOpen,
}) => {
  const e2eeMessage = isE2eeMessage(message) ? message : undefined;
  const url = useDecryptedFileUrl(e2eeMessage, file, transportMeta);
  const alt = file.originalName || file.filename || 'Image';
  const [imgError, setImgError] = useState(false);

  if (!url) {
    return (
      <div className={`${styles.imageCard} ${styles.imageCardPending}`} aria-busy="true">
        <Loader2 size={22} className={panelStyles.spinner} />
      </div>
    );
  }

  if (imgError) {
    return (
      <div className={`${styles.imageCard} ${styles.imageCardError}`} title={alt}>
        <ImageIcon size={22} />
        <span>Unavailable</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.imageCard}
      title={alt}
      onClick={() => onOpen(url, alt)}
    >
      <img src={url} alt={alt} loading="lazy" onError={() => setImgError(true)} />
    </button>
  );
};

type FilesPanelDocumentRowProps = {
  message: Message;
  file: FileAttachmentMeta;
  transportMeta?: ContentMeta;
  metaLine: string;
  onDocView: (payload: { src: string; title: string; kind: DocumentViewerKind }) => void;
  onMediaView: (payload: {
    kind: 'video' | 'audio';
    src: string;
    title: string;
    durationMs?: number;
  }) => void;
};

const FilesPanelDocumentRow: React.FC<FilesPanelDocumentRowProps> = ({
  message,
  file,
  transportMeta,
  metaLine,
  onDocView,
  onMediaView,
}) => {
  const { user, token } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [opening, setOpening] = useState(false);

  const name = file.originalName || file.filename || 'File';
  const docKind = getDocumentViewerKind(file.mimetype, name);
  const badge = getFileTypeBadge(file.mimetype, name);
  const isMediaPreview =
    isVoiceMessage(message) || isVideoFile(file) || isAudioFile(file);

  const openFile = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    try {
      const url = await resolveFileAccessUrl(message, file, transportMeta, user?.id, token);
      if (!url) return;

      if (isMediaPreview) {
        const kind = isVideoFile(file) ? 'video' : 'audio';
        const durationMs =
          getVoiceDurationMs(message.contentMeta) ??
          getVoiceDurationMs(transportMeta);
        onMediaView({ kind, src: url, title: name, durationMs });
        return;
      }

      if (docKind) {
        onDocView({ src: url, title: name, kind: docKind });
        return;
      }

      globalThis.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setOpening(false);
    }
  }, [opening, message, file, transportMeta, user?.id, token, isMediaPreview, docKind, name, onDocView, onMediaView]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadMessageFile(message, file, transportMeta, user?.id, token, name);
    } catch {
      /* ignore */
    } finally {
      setDownloading(false);
    }
  }, [downloading, message, file, transportMeta, user?.id, token, name]);

  const canView = Boolean(docKind || isMediaPreview);

  return (
    <div className={styles.fileRow}>
      <span className={`${styles.fileBadge} ${fileBadgeClass(badge.className)}`} aria-hidden>
        {isImageFile(file) ? (
          <ImageIcon size={20} strokeWidth={2.25} />
        ) : (
          badge.letter
        )}
      </span>
      <span className={styles.fileMeta}>
        <span className={styles.fileName} title={name}>
          {truncateFilenameMiddle(name, 48)}
        </span>
        <span className={styles.fileSub}>{metaLine}</span>
      </span>
      <div className={styles.fileActions}>
        {canView ? (
          <button
            type="button"
            className={styles.fileActionBtn}
            onClick={handler(openFile)}
            disabled={opening}
            aria-label={`View ${name}`}
            title={`View ${name}`}
          >
            {opening ? <Loader2 size={16} className={panelStyles.spinner} /> : <Eye size={16} />}
          </button>
        ) : (
          <button
            type="button"
            className={styles.fileActionBtn}
            onClick={handler(openFile)}
            disabled={opening}
            aria-label={`Open ${name}`}
            title={`Open ${name}`}
          >
            {opening ? (
              <Loader2 size={16} className={panelStyles.spinner} />
            ) : (
              <ExternalLink size={16} />
            )}
          </button>
        )}
        <button
          type="button"
          className={styles.fileActionBtn}
          onClick={handler(handleDownload)}
          disabled={downloading}
          aria-label={`Download ${name}`}
          title={`Download ${name}`}
        >
          {downloading ? (
            <Loader2 size={16} className={panelStyles.spinner} />
          ) : (
            <Download size={16} />
          )}
        </button>
      </div>
    </div>
  );
};

const ChatFilesPanel: React.FC = () => {
  const { activeId } = useChat();
  const [query, setQuery] = useState('');
  const [visibleDocCount, setVisibleDocCount] = useState(DOCUMENTS_PAGE_SIZE);
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null);
  const [docViewer, setDocViewer] = useState<{
    src: string;
    title: string;
    kind: DocumentViewerKind;
  } | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{
    kind: 'video' | 'audio';
    src: string;
    title: string;
    durationMs?: number;
  } | null>(null);
  const closeViewer = useCallback(() => setViewer(null), []);
  const closeDocViewer = useCallback(() => setDocViewer(null), []);
  const closeMediaViewer = useCallback(() => setMediaViewer(null), []);

  const {
    data: messages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMessages(activeId);
  const decryptedBodies = useMessageBodies(messages);

  useEffect(() => {
    if (!activeId || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [activeId, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const mediaItems = useMemo(() => {
    const list = expandMessagesToMediaItems(messages ?? [], decryptedBodies);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(({ file, message }) => {
      const name = (file.originalName ?? file.filename ?? '').toLowerCase();
      const caption = message.ciphertext?.toLowerCase() ?? '';
      return name.includes(q) || caption.includes(q);
    });
  }, [messages, query, decryptedBodies]);

  const images = mediaItems.filter((item) => item.category === 'image');
  const documents = mediaItems.filter((item) => item.category === 'document');

  useEffect(() => {
    setVisibleDocCount(DOCUMENTS_PAGE_SIZE);
  }, [activeId, query]);

  const visibleDocuments = documents.slice(0, visibleDocCount);
  const hasMoreDocuments = visibleDocCount < documents.length;

  const renderMeta = (m: Message) => {
    const name = m.sender?.displayName || m.sender?.email || 'Someone';
    return `Shared by ${name} on ${formatChatTimestamp(m.createdAt)}`;
  };

  if (isLoading) {
    return (
      <div className={panelStyles.panel}>
        <div className={panelStyles.loading}>
          <Loader2 size={20} className={panelStyles.spinner} />
          Loading files…
        </div>
      </div>
    );
  }

  return (
    <div className={panelStyles.panel}>
      <div className={panelStyles.searchRow}>
        <label className={panelStyles.searchInput}>
          <Search size={16} />
          <input
            type="search"
            placeholder="Search files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {mediaItems.length === 0 ? (
        <div className={panelStyles.empty}>
          <div className={panelStyles.emptyIcon}>
            <ImageIcon size={26} />
          </div>
          <h3>No files yet</h3>
          <p>Photos and documents shared in this conversation will appear here.</p>
        </div>
      ) : (
        <>
          {images.length > 0 && (
            <section className={panelStyles.section}>
              <h4 className={panelStyles.sectionTitle}>Images</h4>
              <div className={styles.imageGrid}>
                {images.map(({ key, message, file, transportMeta }) => (
                  <FilesPanelImageCard
                    key={key}
                    message={message}
                    file={file}
                    transportMeta={transportMeta}
                    onOpen={(src, alt) => setViewer({ src, alt })}
                  />
                ))}
              </div>
            </section>
          )}

          {documents.length > 0 && (
            <section className={panelStyles.section}>
              <h4 className={panelStyles.sectionTitle}>Documents</h4>
              <div className={styles.fileList}>
                {visibleDocuments.map(({ key, message, file, transportMeta }) => (
                  <FilesPanelDocumentRow
                    key={key}
                    message={message}
                    file={file}
                    transportMeta={transportMeta}
                    metaLine={renderMeta(message)}
                    onDocView={(payload) => setDocViewer(payload)}
                    onMediaView={(payload) => setMediaViewer(payload)}
                  />
                ))}
              </div>
              {hasMoreDocuments && (
                <button
                  type="button"
                  className={styles.showMoreDocsBtn}
                  onClick={() =>
                    setVisibleDocCount((count) =>
                      Math.min(count + DOCUMENTS_PAGE_SIZE, documents.length),
                    )
                  }
                >
                  Show {Math.min(DOCUMENTS_PAGE_SIZE, documents.length - visibleDocCount)} more
                </button>
              )}
            </section>
          )}
          {isFetchingNextPage && (
            <div className={panelStyles.loading}>
              <Loader2 size={16} className={panelStyles.spinner} />
              Loading more…
            </div>
          )}
        </>
      )}

      <ImageViewerModal
        open={Boolean(viewer)}
        src={viewer?.src ?? ''}
        alt={viewer?.alt}
        onClose={closeViewer}
      />
      {docViewer && (
        <DocumentViewerModal
          open
          src={docViewer.src}
          title={docViewer.title}
          kind={docViewer.kind}
          onClose={closeDocViewer}
        />
      )}
      {mediaViewer && (
        <MediaPreviewModal
          open
          kind={mediaViewer.kind}
          src={mediaViewer.src}
          title={mediaViewer.title}
          durationMs={mediaViewer.durationMs}
          onClose={closeMediaViewer}
        />
      )}
    </div>
  );
};

export default ChatFilesPanel;
