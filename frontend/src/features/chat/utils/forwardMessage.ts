import type { Message } from '../types';
import type { DecryptedBody } from './messageBody';
import {
  getMessageDisplayBody,
  getMessageLinkPreview,
  messageWithDecryptedMeta,
} from './messageBody';
import { getMessageFiles, isImageFile, isVoiceMessage } from './fileMeta';
import { getMessagePreviewText } from './messagePreview';

export type ForwardSendPayload = {
  text: string;
  kind: 'TEXT' | 'IMAGE' | 'FILE';
  contentMeta?: unknown;
  blocked?: boolean;
  blockedReason?: string;
};

function normalizeCaption(msg: Message, bodies: Record<string, DecryptedBody>, userId: string): string {
  return getMessageDisplayBody(msg, bodies, userId).trim();
}

export function buildForwardSendPayload(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
  userId: string,
): ForwardSendPayload {
  const displayMsg = messageWithDecryptedMeta(msg);
  const files = getMessageFiles(displayMsg);
  const hasMedia =
    msg.kind === 'IMAGE' ||
    msg.kind === 'FILE' ||
    Boolean(files?.length) ||
    isVoiceMessage(displayMsg);

  const caption = normalizeCaption(msg, bodies, userId);

  if (!hasMedia) {
    const text =
      caption || getMessagePreviewText(msg, bodies, userId).trim() || 'Forwarded message';
    const preview = getMessageLinkPreview(msg, bodies);
    return {
      text,
      kind: 'TEXT',
      contentMeta: preview ? { preview } : undefined,
    };
  }

  const cm = displayMsg.contentMeta;
  const meta: Record<string, unknown> = {};
  if (files?.length) meta.files = files;
  if (isVoiceMessage(displayMsg)) {
    meta.voiceNote = true;
    if (typeof cm?.durationMs === 'number') meta.durationMs = cm.durationMs;
  }
  const preview = getMessageLinkPreview(msg, bodies);
  if (preview) meta.preview = preview;

  const fileList = files ?? [];
  const allImages =
    fileList.length > 0 &&
    fileList.every((f) => isImageFile(f) || (f.mimetype ?? '').toLowerCase().startsWith('image/'));

  return {
    text: caption,
    kind: forwardMediaKind(displayMsg, allImages),
    contentMeta: Object.keys(meta).length ? meta : undefined,
  };
}

function forwardMediaKind(
  displayMsg: Message,
  allImages: boolean,
): ForwardSendPayload['kind'] {
  if (isVoiceMessage(displayMsg)) return 'FILE';
  if (allImages) return 'IMAGE';
  return 'FILE';
}
