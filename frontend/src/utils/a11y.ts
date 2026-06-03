import type { KeyboardEvent, MouseEvent } from 'react';

/** Close modal only when the backdrop itself was clicked (no panel stopPropagation handlers). */
export function overlayBackdropMouseDown(onClose: () => void) {
  return (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };
}

/** Prevent modal panel clicks from closing the overlay (keyboard parity for Sonar S1082). */
export function stopPropagationKeyboard(e: KeyboardEvent): void {
  e.stopPropagation();
}

/** Stop pointer/keyboard events from bubbling to overlay backdrops (dropdown panels). */
export const overlayPanelEventProps = {
  onMouseDown: (e: MouseEvent) => e.stopPropagation(),
  onKeyDown: stopPropagationKeyboard,
} as const;

/** Keyboard handler for clickable overlay backdrops. */
export function overlayBackdropKeyDown(onAction: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAction();
    }
  };
}
