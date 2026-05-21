import type { Message, ReplyPreview } from '../types';
import {
  getAttachmentPreviewLabel,
  getMessageFiles,
  isAudioFile,
  isVideoFile,
  isVoiceMessage,
} from './fileMeta';
import {
  getMessageDisplayBody,
  messageWithDecryptedMeta,
  type DecryptedBody,
} from '../../e2ee/useMessageBodies';
import { isE2eeMessage } from '../../e2ee/directChat';

type PreviewMessage = Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId' | 'kind'>;

function mediaFallbackLabel(msg: PreviewMessage): string {
  const merged = msg as Message;
  if (isVoiceMessage(merged)) return 'Voice message';
  const files = getMessageFiles(merged);
  const primary = files?.[0];
  if (primary && isVideoFile(primary)) return 'Video';
  if (primary && isAudioFile(primary)) return 'Audio';
  if (merged.kind === 'IMAGE') return 'Photo';
  if (merged.kind === 'FILE') {
    return primary?.originalName || primary?.filename || 'File';
  }
  if (merged.kind === 'POLL') return 'Poll';
  return 'Message';
}

/** True when ciphertext looks like an E2EE envelope (base64 JSON), not human text. */
export function isLikelyE2eeCiphertext(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('eyJ') || t.length < 48) return false;
  return /^eyJ[A-Za-z0-9+/=_-]+$/.test(t);
}

/** Human-readable preview for replies, composer bar, copy, sidebar, etc. */
export function getMessagePreviewText(
  msg: PreviewMessage,
  bodies?: Record<string, DecryptedBody>,
  userId?: string,
): string {
  if (bodies && userId) {
    const full = msg as Message;
    const text = getMessageDisplayBody(full, bodies, userId);
    if (text === '…') return 'Decrypting…';
    if (text.trim()) return text;
    return mediaFallbackLabel(messageWithDecryptedMeta(full, bodies));
  }

  if (isE2eeMessage(msg as Message)) {
    return mediaFallbackLabel(msg as Message);
  }

  const raw = msg.ciphertext?.trim() ?? '';
  if (raw && !isLikelyE2eeCiphertext(raw)) return raw;

  if (raw) return mediaFallbackLabel(msg as Message);

  return mediaFallbackLabel(msg as Message);
}

export function replyPreviewLabel(
  reply: ReplyPreview,
  bodies?: Record<string, DecryptedBody>,
  userId?: string,
): string {
  return getMessagePreviewText(reply, bodies, userId);
}

/** Sidebar last line when only encrypted ciphertext string is available from the API. */
export function getConversationLastMessagePreview(
  ciphertext: string | undefined,
  chatE2ee?: boolean,
): string {
  if (!ciphertext?.trim()) return 'No messages yet';
  if (chatE2ee || isLikelyE2eeCiphertext(ciphertext)) return 'Message';
  return ciphertext;
}
