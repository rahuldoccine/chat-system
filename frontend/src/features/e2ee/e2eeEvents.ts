export const E2EE_KEYS_UNLOCKED = 'e2ee:keys-unlocked';

export function emitE2eeKeysUnlocked(userId: string): void {
  if (globalThis.window === undefined) return;
  globalThis.dispatchEvent(new CustomEvent(E2EE_KEYS_UNLOCKED, { detail: { userId } }));
}

export function onE2eeKeysUnlocked(
  handler: (userId: string) => void,
): () => void {
  if (globalThis.window === undefined) return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ userId: string }>).detail;
    if (detail?.userId) handler(detail.userId);
  };
  globalThis.addEventListener(E2EE_KEYS_UNLOCKED, listener);
  return () => globalThis.removeEventListener(E2EE_KEYS_UNLOCKED, listener);
}
