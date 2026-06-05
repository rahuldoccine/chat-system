import React from 'react';
import styles from './MediaAttachment.module.css';
import SingleImageViewer from './SingleImageViewer';
import { useSingleImageAttachment } from './useSingleImageAttachment';
import { SingleImageAttachmentView } from './SingleImageAttachmentView';
import type { Message } from '../types';
import type { FileAttachmentMeta } from '../utils/fileMeta';

export type SingleImageAttachmentProps = {
  contentMeta: Message['contentMeta'];
  onMediaLoad?: () => void;
  embedded?: boolean;
  primaryFile?: FileAttachmentMeta;
  mediaTimestamp?: {
    createdAt: string;
    editedAt?: string | null;
    isMe: boolean;
    receiptStatus?: 'sent' | 'delivered' | 'read';
  };
};

const SingleImageAttachment: React.FC<SingleImageAttachmentProps> = (props) => {
  const {
    contentMeta,
    onMediaLoad,
    embedded = false,
    primaryFile,
    mediaTimestamp,
  } = props;

  const state = useSingleImageAttachment({
    contentMeta,
    onMediaLoad,
    primaryFile,
  });

  if (state.unavailable) {
    return <div className={styles.imageError}>Image unavailable</div>;
  }

  return (
    <>
      <SingleImageAttachmentView
        embedded={embedded}
        displayName={state.displayName}
        fullUrl={state.fullUrl}
        imgRef={state.imgRef}
        imgError={state.imgError}
        imgLoaded={state.imgLoaded}
        isGif={state.isGif}
        aspectRatio={state.aspectRatio}
        showPlaceholder={state.showPlaceholder}
        overlayActive={state.overlayActive}
        canOpenViewer={state.canOpenViewer}
        viewerOpen={state.viewerOpen}
        onMouseEnter={() => state.setOverlayActive(true)}
        onMouseLeave={() => state.setOverlayActive(false)}
        onFocusCapture={() => state.setOverlayActive(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            state.setOverlayActive(false);
          }
        }}
        onOpen={state.openViewer}
        onKeyDown={state.openViewerFromKeyboard}
        onImageLoad={state.onImageLoad}
        onImgError={() => state.setImgError(true)}
        onDownload={state.handleDownload}
        mediaTimestamp={mediaTimestamp}
      />
      <SingleImageViewer
        open={state.viewerOpen}
        src={state.fullUrl ?? ''}
        alt={state.displayName}
        onClose={state.closeViewer}
      />
    </>
  );
};

export default SingleImageAttachment;
