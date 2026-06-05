import React, { useCallback, useState } from 'react';
import { handler } from '../../../utils/asyncHandler';
import { createPortal } from 'react-dom';
import styles from './ImageViewerModal.module.css';
import { X, Download, Loader2 } from 'lucide-react';
import { ModalDialog } from '../../../components/ModalDialog';
import { downloadFileFromUrl } from '../utils/downloadFile';
import { useViewerModalLock } from '../hooks/useViewerModalLock';

export type ImageViewerModalProps = {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
};

const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ open, src, alt = 'Image', onClose }) => {
  const [downloading, setDownloading] = useState(false);

  useViewerModalLock(open, onClose, { bodyClass: 'image-viewer-open' });

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFileFromUrl(src, alt);
    } finally {
      setDownloading(false);
    }
  }, [downloading, src, alt]);

  if (!open) return null;

  return createPortal(
    <ModalDialog aria-label={alt} onClose={onClose}>
      <div className={styles.panel}>
        <div className={styles.stage}>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={handler(handleDownload)}
              disabled={downloading}
              aria-label="Download"
            >
              {downloading ? <Loader2 size={20} className={styles.iconSpinner} /> : <Download size={20} />}
            </button>
            <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
              <X size={22} />
            </button>
          </div>
          <img src={src} alt={alt} className={styles.image} draggable={false} />
        </div>
      </div>
    </ModalDialog>,
    document.body,
  );
};

export default ImageViewerModal;
