/** Minimum gap between typing:update broadcasts per (chatId, userId). */
const TYPING_EMIT_MS = 2_000;

const lastEmit = new Map<string, number>();

export function typingThrottleKey(chatId: string, userId: string): string {
  return `${chatId}:${userId}`;
}

export function shouldEmitTypingUpdate(chatId: string, userId: string): boolean {
  const key = typingThrottleKey(chatId, userId);
  const now = Date.now();
  const prev = lastEmit.get(key) ?? 0;
  if (now - prev < TYPING_EMIT_MS) {
    return false;
  }
  lastEmit.set(key, now);
  return true;
}

export function clearTypingThrottle(chatId: string, userId: string): void {
  lastEmit.delete(typingThrottleKey(chatId, userId));
}
