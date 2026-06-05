import type { Message } from '../types';
import { getMessageDisplayBody, type DecryptedBody } from './messageBody';
import { isVoiceMessage } from './fileMeta';
import { getMessagePreviewText } from './messagePreview';

type MessagesCache = { pages: Array<{ data: Message[] }> };

export function patchMessageInCache(
  old: MessagesCache | undefined,
  messageId: string,
  patch: Partial<Message>,
): MessagesCache | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      data: page.data.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
    })),
  };
}

export function removeMessageFromCache(
  old: MessagesCache | undefined,
  messageId: string,
): MessagesCache | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      data: page.data.filter((m) => m.id !== messageId),
    })),
  };
}

export function getMessageCopyText(
  msg: Message,
  bodies?: Record<string, DecryptedBody>,
  userId?: string,
): string {
  return getMessagePreviewText(msg, bodies, userId);
}

/** Copy is for plain text / captions only — not files, images, voice, video, or polls. */
export function canCopyMessage(
  msg: Message,
  bodies?: Record<string, DecryptedBody>,
  userId?: string,
): boolean {
  if (msg.deletedAt) return false;
  if (msg.kind === 'POLL' || msg.kind === 'IMAGE') return false;
  if (isVoiceMessage(msg)) return false;

  const text =
    bodies && userId
      ? getMessageDisplayBody(msg, bodies, userId)
      : (msg.ciphertext?.trim() ?? '');

  return text !== '…' && Boolean(text.trim());
}

/** Edit is text-only: plain messages or captions on media — not file/voice-only uploads. */
export function canEditMessage(
  msg: Message,
  userId?: string,
  bodies?: Record<string, DecryptedBody>,
): boolean {
  if (!userId || msg.senderId !== userId || msg.deletedAt) return false;
  if (msg.kind === 'POLL' || isVoiceMessage(msg)) return false;

  const text =
    bodies && userId
      ? getMessageDisplayBody(msg, bodies, userId)
      : (msg.ciphertext?.trim() ?? '');

  return text !== '…' && Boolean(text.trim());
}
