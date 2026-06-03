import React from 'react';
import styles from './ConfirmModal.module.css';
import { AlertCircle } from 'lucide-react';
import { ModalDialog } from '../../../components/ModalDialog';

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
  if (!open) return null;

  return (
    <ModalDialog
      className={styles.overlay}
      aria-labelledby="alert-modal-title"
      aria-describedby="alert-modal-desc"
      onClose={onClose}
    >
      <div className={styles.modal}>
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
    </ModalDialog>
  );
};

export default AlertModal;
