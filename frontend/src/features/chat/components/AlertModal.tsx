import React, { useEffect } from 'react';
import styles from './ConfirmModal.module.css';
import { AlertCircle } from 'lucide-react';

export type AlertModalProps = {
  open: boolean;
  title: string;
  description: string;
  okLabel?: string;
  onClose: () => void;
};

/** Single-action dialog for errors and informational messages (replaces browser `alert()`). */
const AlertModal: React.FC<AlertModalProps> = ({
  open,
  title,
  description,
  okLabel = 'OK',
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        aria-describedby="alert-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.alertHeader}>
          <AlertCircle size={22} className={styles.alertIcon} aria-hidden />
          <h3 id="alert-modal-title" className={styles.alertTitle}>
            {title}
          </h3>
        </div>
        <p id="alert-modal-desc" className={styles.description}>
          {description}
        </p>
        <div className={`${styles.actions} ${styles.alertActions}`}>
          <button type="button" className={styles.confirmBtn} onClick={onClose}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
