import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import styles from './ModalDialog.module.css';

export type ModalDialogProps = Omit<ComponentPropsWithoutRef<'dialog'>, 'open'> & {
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** Native `<dialog>` wrapper with showModal, backdrop button, and Escape handling. */
export function ModalDialog({
  open = true,
  onClose,
  children,
  onCancel,
  className,
  ...rest
}: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, className].filter(Boolean).join(' ')}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
        onCancel?.(e);
      }}
      {...rest}
    >
      <button
        type="button"
        className={styles.backdropClose}
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
