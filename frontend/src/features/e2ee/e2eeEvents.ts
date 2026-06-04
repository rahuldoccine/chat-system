export const E2EE_KEYS_UNLOCKED = 'e2ee:keys-unlocked';
export const E2EE_GROUP_KEYS_UPDATED = 'e2ee:group-keys-updated';

export function emitE2eeKeysUnlocked(userId: string): void {
  if (globalThis.window === undefined) return;
  globalThis.dispatchEvent(new CustomEvent(E2EE_KEYS_UNLOCKED, { detail: { userId } }));
}

export function emitE2eeGroupKeysUpdated(chatId: string): void {
  if (globalThis.window === undefined) return;
  globalThis.dispatchEvent(new CustomEvent(E2EE_GROUP_KEYS_UPDATED, { detail: { chatId } }));
}

export function onE2eeGroupKeysUpdated(
  handler: (chatId: string) => void,
): () => void {
  if (globalThis.window === undefined) return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ chatId: string }>).detail;
    if (detail?.chatId) handler(detail.chatId);
  };
  globalThis.addEventListener(E2EE_GROUP_KEYS_UPDATED, listener);
  return () => globalThis.removeEventListener(E2EE_GROUP_KEYS_UPDATED, listener);
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
