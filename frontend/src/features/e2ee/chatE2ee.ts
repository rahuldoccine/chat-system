import type { Chat } from '../chat/types';
import { E2EE_VERSION } from './protocol';

export function isDmE2eeChat(chat: Pick<Chat, 'type' | 'e2eeMode'> | null | undefined): boolean {
  return chat?.type === 'DIRECT' && chat.e2eeMode === 'DM_V1';
}

export function buildE2eeContentMeta(
  base: Record<string, unknown> | undefined,
  encrypted: { contentMeta: Record<string, unknown> },
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    ...encrypted.contentMeta,
    e2eeVersion: E2EE_VERSION,
  };
}
