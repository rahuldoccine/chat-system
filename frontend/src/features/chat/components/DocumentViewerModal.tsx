import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderAsync } from 'docx-preview';
import styles from './ImageViewerModal.module.css';
import docStyles from './DocumentViewerModal.module.css';
import { X, Download, Loader2 } from 'lucide-react';
import type { DocumentViewerKind } from '../utils/documentViewer';
import { isSpreadsheetViewerKind } from '../utils/documentViewer';
import { parseSpreadsheetBlob, type SpreadsheetSheet } from '../utils/spreadsheetPreview';
import SpreadsheetPreview from './SpreadsheetPreview';
import { downloadFileFromUrl } from '../utils/downloadFile';

/** Hide native PDF chrome (Chrome/Edge); harmless on browsers that ignore hash params. */
function buildPdfIframeSrc(blobUrl: string): string {
  return `${blobUrl}#toolbar=0&navpanes=0&scrollbar=1`;
}

export type DocumentViewerModalProps = {
  open: boolean;
  src: string;
  title?: string;
  kind: DocumentViewerKind;
  onClose: () => void;
};

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  open,
  src,
  title = 'Document',
  kind,
  onClose,
}) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const docxRef = useRef<HTMLDivElement>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [spreadsheetSheets, setSpreadsheetSheets] = useState<SpreadsheetSheet[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!open) {
      setPdfBlobUrl(null);
      setFileBlob(null);
      setSpreadsheetSheets(null);
      setError(null);
      setLoading(false);
      setDownloading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPdfBlobUrl(null);
      setFileBlob(null);
      setSpreadsheetSheets(null);

      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("This file couldn't be opened");
        const blob = await res.blob();
        if (cancelled) return;

        setFileBlob(blob);

        if (kind === 'pdf') {
          objectUrl = URL.createObjectURL(blob);
          setPdfBlobUrl(objectUrl);
        } else if (isSpreadsheetViewerKind(kind)) {
          const sheets = await parseSpreadsheetBlob(blob);
          if (!cancelled) setSpreadsheetSheets(sheets);
        }
      } catch {
        if (!cancelled) setError("We can't preview this file here. Try downloading it instead.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, src, kind]);

  useEffect(() => {
    if (!open || kind !== 'docx' || !fileBlob || !docxRef.current) return;

    const container = docxRef.current;
    container.innerHTML = '';

    let cancelled = false;

    renderAsync(fileBlob, container, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
    }).catch(() => {
      if (!cancelled) setError('Unable to preview this file. Try downloading it instead.');
    });

    return () => {
      cancelled = true;
    };
  }, [open, kind, fileBlob]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFileFromUrl(src, title, fileBlob);
    } catch {
      setError("Download didn't work. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [downloading, src, title, fileBlob]);

  if (!open) return null;

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCloseRef.current();
  };

  const showSpreadsheet =
    isSpreadsheetViewerKind(kind) && spreadsheetSheets && !loading && !error;

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
        <div className={docStyles.documentPanel}>
          <header className={docStyles.documentChrome}>
            <p className={docStyles.documentTitle} title={title}>
              {title}
            </p>
            <div className={docStyles.documentActions}>
              <button
                type="button"
                className={docStyles.chromeBtn}
                onClick={() => void handleDownload()}
                disabled={downloading}
                aria-label="Download"
              >
                {downloading ? <Loader2 size={18} className={docStyles.spinner} /> : <Download size={18} />}
              </button>
              <button
                type="button"
                className={docStyles.chromeBtn}
                onClick={() => onCloseRef.current()}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          <div className={docStyles.documentBody}>
            {loading && (
              <div className={docStyles.state}>
                <Loader2 size={28} className={docStyles.spinner} />
                <span>Loading preview…</span>
              </div>
            )}

            {error && !loading && (
              <div className={docStyles.state}>
                <p>{error}</p>
                <button
                  type="button"
                  className={docStyles.downloadLink}
                  onClick={() => void handleDownload()}
                  disabled={downloading}
                >
                  {downloading ? 'Downloading…' : 'Download file'}
                </button>
              </div>
            )}

            {kind === 'pdf' && pdfBlobUrl && !loading && !error && (
              <iframe
                title={title}
                src={buildPdfIframeSrc(pdfBlobUrl)}
                className={docStyles.pdfFrame}
              />
            )}

            {kind === 'docx' && (
              <div
                ref={docxRef}
                className={docStyles.docxScroll}
                hidden={loading || Boolean(error)}
              />
            )}

            {showSpreadsheet && <SpreadsheetPreview sheets={spreadsheetSheets} />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DocumentViewerModal;
