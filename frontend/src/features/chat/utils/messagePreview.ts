import type { Message, ReplyPreview } from '../types';
import {
  getMessageFiles,
  isAudioFile,
  isVideoFile,
  isVoiceMessage,
} from './fileMeta';
import {
  getMessageDisplayBody,
  messageWithDecryptedMeta,
  type DecryptedBody,
} from './messageBody';

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

/** Human-readable preview for replies, composer bar, copy, sidebar, etc. */
export function getMessagePreviewText(
  msg: PreviewMessage,
  bodies?: Record<string, DecryptedBody>,
  userId?: string,
): string {
  if (bodies && userId) {
    const full = msg as Message;
    const text = getMessageDisplayBody(full, bodies, userId);
    if (text.trim()) return text;
    return mediaFallbackLabel(messageWithDecryptedMeta(full));
  }

  const raw = msg.ciphertext?.trim() ?? '';
  if (raw) return raw;

  return mediaFallbackLabel(msg as Message);
}

export function replyPreviewLabel(
  reply: ReplyPreview,
  bodies?: Record<string, DecryptedBody>,
  userId?: string,
): string {
  return getMessagePreviewText(reply, bodies, userId);
}

/** Sidebar last line when only ciphertext string is available from the API. */
export function getConversationLastMessagePreview(ciphertext: string | undefined): string {
  if (!ciphertext?.trim()) return 'No messages yet';
  return ciphertext;
}
