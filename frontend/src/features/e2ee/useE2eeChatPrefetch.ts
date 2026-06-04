import type { Chat } from '../chat/types';

/** Group E2EE uses per-member dm-v1 envelopes; no sender-key prefetch. */
export function useE2eeChatPrefetch(_chatId: string | null, _chat: Chat | null | undefined): void {
  /* no-op */
}
