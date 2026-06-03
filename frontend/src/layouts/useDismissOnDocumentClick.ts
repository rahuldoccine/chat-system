import { useEffect } from 'react';

/** Close a popover/menu on the next document click after it opens. */
export function useDismissOnDocumentClick(active: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!active) return;
    const close = () => onDismiss();
    const timer = globalThis.setTimeout(() => {
      document.addEventListener('click', close);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
    };
  }, [active, onDismiss]);
}
