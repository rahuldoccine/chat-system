import type React from 'react';
import { Download, ImageIcon } from 'lucide-react';
import MessageMeta from './MessageMeta';
import styles from './MediaAttachment.module.css';

export type SingleImageAttachmentViewProps = Readonly<{
  embedded: boolean;
  displayName: string;
  fullUrl: string | undefined;
  imgRef: React.RefObject<HTMLImageElement | null>;
  imgError: boolean;
  imgLoaded: boolean;
  isGif: boolean;
  aspectRatio: string | undefined;
  showPlaceholder: boolean;
  overlayActive: boolean;
  canOpenViewer: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocusCapture: () => void;
  onBlurCapture: (e: React.FocusEvent) => void;
  onOpen: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onImageLoad: () => void;
  onImgError: () => void;
  onDownload: (e: React.MouseEvent) => void;
  mediaTimestamp?: {
    createdAt: string;
    editedAt?: string | null;
    isMe: boolean;
    receiptStatus?: 'sent' | 'delivered' | 'read';
  };
  viewerOpen: boolean;
}>;

function buildImageContainerClass(props: SingleImageAttachmentViewProps): string {
  return [
    styles.imageContainer,
    props.embedded ? styles.imageContainerEmbedded : '',
    props.viewerOpen ? styles.imageContainerViewerOpen : '',
    props.showPlaceholder ? styles.imageContainerLoading : '',
    props.overlayActive ? styles.imageContainerOverlayActive : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function imageContainerStyle(
  embedded: boolean,
  aspectRatio: string | undefined,
): React.CSSProperties | undefined {
  return !embedded && aspectRatio ? { aspectRatio } : undefined;
}

function ImagePlaceholder({ displayName }: Readonly<{ displayName: string }>) {
  return (
    <div className={styles.mediaShimmer} aria-hidden>
      <span className={styles.mediaShimmerLabel}>{displayName}</span>
    </div>
  );
}

type ImageContentProps = Pick<
  SingleImageAttachmentViewProps,
  | 'fullUrl'
  | 'imgRef'
  | 'displayName'
  | 'embedded'
  | 'isGif'
  | 'imgLoaded'
  | 'imgError'
  | 'onImageLoad'
  | 'onImgError'
>;

function ImageContent({
  fullUrl,
  imgRef,
  displayName,
  embedded,
  isGif,
  imgLoaded,
  imgError,
  onImageLoad,
  onImgError,
}: Readonly<ImageContentProps>) {
  if (!fullUrl || imgError) return null;
  return (
    <img
      ref={imgRef}
      src={fullUrl}
      alt={displayName}
      className={`${styles.image} ${embedded ? styles.imageEmbedded : ''} ${
        isGif ? styles.imageGif : ''
      } ${imgLoaded ? styles.imageVisible : styles.imageHidden}`}
      crossOrigin="anonymous"
      onLoad={onImageLoad}
      onError={onImgError}
      draggable={false}
    />
  );
}

function ImageErrorFallback({ onOpen }: Readonly<{ onOpen: (e: React.MouseEvent) => void }>) {
  return (
    <button type="button" className={styles.imageError} onClick={onOpen}>
      <ImageIcon size={20} />
      <span>View image</span>
    </button>
  );
}

function ImageLoadedOverlay({
  displayName,
  onDownload,
}: Readonly<{
  displayName: string;
  onDownload: (e: React.MouseEvent) => void;
}>) {
  return (
    <div className={styles.imageOverlay}>
      <span className={styles.imageName}>{displayName}</span>
      <button
        type="button"
        className={styles.imageAction}
        onClick={onDownload}
        aria-label={`Download ${displayName}`}
      >
        <Download size={16} />
      </button>
    </div>
  );
}

function MediaTimestampBlock({
  mediaTimestamp,
}: Readonly<{
  mediaTimestamp: NonNullable<SingleImageAttachmentViewProps['mediaTimestamp']>;
}>) {
  return (
    <div className={styles.mediaTimestamp}>
      <MessageMeta
        createdAt={mediaTimestamp.createdAt}
        editedAt={mediaTimestamp.editedAt}
        isMe={mediaTimestamp.isMe}
        onMedia
        receiptStatus={mediaTimestamp.receiptStatus}
      />
    </div>
  );
}

export function SingleImageAttachmentView(props: SingleImageAttachmentViewProps) {
  const {
    embedded,
    displayName,
    fullUrl,
    imgRef,
    imgError,
    imgLoaded,
    isGif,
    aspectRatio,
    showPlaceholder,
    canOpenViewer,
    onMouseEnter,
    onMouseLeave,
    onFocusCapture,
    onBlurCapture,
    onOpen,
    onKeyDown,
    onImageLoad,
    onImgError,
    onDownload,
    mediaTimestamp,
  } = props;

  const content = (
    <>
      {showPlaceholder ? <ImagePlaceholder displayName={displayName} /> : null}
      <ImageContent
        fullUrl={fullUrl}
        imgRef={imgRef}
        displayName={displayName}
        embedded={embedded}
        isGif={isGif}
        imgLoaded={imgLoaded}
        imgError={imgError}
        onImageLoad={onImageLoad}
        onImgError={onImgError}
      />
      {fullUrl && imgError ? <ImageErrorFallback onOpen={onOpen} /> : null}
      {imgLoaded && !imgError ? (
        <ImageLoadedOverlay displayName={displayName} onDownload={onDownload} />
      ) : null}
      {mediaTimestamp ? <MediaTimestampBlock mediaTimestamp={mediaTimestamp} /> : null}
    </>
  );

  const containerClass = buildImageContainerClass(props);
  const containerStyle = imageContainerStyle(embedded, aspectRatio);
  const hoverProps = {
    onMouseEnter,
    onMouseLeave,
    onFocusCapture,
    onBlurCapture,
  };

  if (canOpenViewer) {
    return (
      <button
        type="button"
        className={containerClass}
        style={containerStyle}
        {...hoverProps}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        aria-label={`Open ${displayName}`}
        aria-busy={showPlaceholder && !fullUrl ? true : undefined}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={containerClass}
      style={containerStyle}
      {...hoverProps}
      aria-label={`Loading ${displayName}`}
      aria-busy={showPlaceholder && !fullUrl ? true : undefined}
    >
      {content}
    </div>
  );
}
