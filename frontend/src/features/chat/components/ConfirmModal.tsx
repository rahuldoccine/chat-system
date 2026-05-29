import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import styles from './ConfirmModal.module.css';
import { Loader2 } from 'lucide-react';

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
}) => (
  <Dialog.Root
    open={open}
    onOpenChange={(next) => {
      if (!next && !isLoading) onCancel();
    }}
  >
    <Dialog.Portal>
      <Dialog.Overlay className={`${styles.overlay} modalSheetOverlay`} />
      <Dialog.Content className={`${styles.modal} modalSheetPanel modalSheetPanelFixed`} aria-describedby="confirm-modal-desc">
        <Dialog.Title id="confirm-modal-title" className={styles.title}>
          {title}
        </Dialog.Title>
        <Dialog.Description id="confirm-modal-desc" className={styles.description}>
          {description}
        </Dialog.Description>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={variant === 'danger' ? styles.dangerBtn : styles.confirmBtn}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 size={16} className={styles.spinner} /> : confirmLabel}
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export default ConfirmModal;
