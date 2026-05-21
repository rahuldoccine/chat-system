import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ImageViewerModal.module.css';
import { X, Download, Loader2 } from 'lucide-react';
import { downloadFileFromUrl } from '../utils/downloadFile';

export type ImageViewerModalProps = {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
};

const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ open, src, alt = 'Image', onClose }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('image-viewer-open');

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove('image-viewer-open');
    };
  }, [open]);

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

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCloseRef.current();
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.stage}>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => void handleDownload()}
              disabled={downloading}
              aria-label="Download"
            >
              {downloading ? <Loader2 size={20} className={styles.iconSpinner} /> : <Download size={20} />}
            </button>
            <button type="button" className={styles.iconBtn} onClick={() => onCloseRef.current()} aria-label="Close">
              <X size={22} />
            </button>
          </div>
          <img src={src} alt={alt} className={styles.image} draggable={false} />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ImageViewerModal;
