import { useEffect, useRef } from 'react';

type ViewerModalLockOptions = {
  bodyClass?: string;
};

/** Escape-to-close and body scroll lock for fullscreen media/document viewers. */
export function useViewerModalLock(
  open: boolean,
  onClose: () => void,
  options?: ViewerModalLockOptions,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const bodyClass = options?.bodyClass;
    if (bodyClass) document.body.classList.add(bodyClass);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      if (bodyClass) document.body.classList.remove(bodyClass);
    };
  }, [open, options?.bodyClass]);
}
