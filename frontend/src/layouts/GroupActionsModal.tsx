import { AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';
import { ModalDialog } from '../components/ModalDialog';
import { GroupActionsMotionPanel } from './GroupActionsMotionPanel';
import styles from './MainLayout.module.css';

type GroupActionsModalProps = Readonly<{
  open: boolean;
  modalKey: string;
  ariaLabel: string;
  panelClassName: string;
  onClose: () => void;
  children: ReactNode;
}>;

export function GroupActionsModal({
  open,
  modalKey,
  ariaLabel,
  panelClassName,
  onClose,
  children,
}: GroupActionsModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <ModalDialog
          key={modalKey}
          className={styles.groupActionsOverlay}
          aria-label={ariaLabel}
          onClose={onClose}
        >
          <GroupActionsMotionPanel className={panelClassName}>{children}</GroupActionsMotionPanel>
        </ModalDialog>
      )}
    </AnimatePresence>
  );
}
