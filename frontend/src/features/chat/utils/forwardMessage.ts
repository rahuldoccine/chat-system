import type { Message } from '../types';
import type { DecryptedBody } from '../../e2ee/useMessageBodies';
import {
  getMessageDisplayBody,
  getMessageLinkPreview,
  messageWithDecryptedMeta,
} from '../../e2ee/useMessageBodies';
import { isE2eeMessage } from '../../e2ee/directChat';
import { getMessageFiles, isImageFile, isVoiceMessage } from './fileMeta';
import { getMessagePreviewText, isLikelyE2eeCiphertext } from './messagePreview';

export type ForwardSendPayload = {
  text: string;
  kind: 'TEXT' | 'IMAGE' | 'FILE';
  contentMeta?: unknown;
  /** Media forward blocked until E2EE payload is decrypted. */
  blocked?: boolean;
  blockedReason?: string;
};

function stripE2eeTransportFields(meta: Record<string, unknown>): Record<string, unknown> {
  const out = { ...meta };
  delete out.e2eeVersion;
  delete out.senderDeviceId;
  delete out.peerDeviceId;
  delete out.senderFingerprint;
  delete out.attachmentRefs;
  return out;
}

function normalizeCaption(msg: Message, bodies: Record<string, DecryptedBody>, userId: string): string {
  const raw = getMessageDisplayBody(msg, bodies, userId);
  if (raw === '…' || raw === '[Unable to decrypt]') return '';
  return raw.trim();
}

export function buildForwardSendPayload(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
  userId: string,
): ForwardSendPayload {
  const displayMsg = messageWithDecryptedMeta(msg, bodies);
  const files = getMessageFiles(displayMsg);
  const hasMedia =
    msg.kind === 'IMAGE' ||
    msg.kind === 'FILE' ||
    Boolean(files?.length) ||
    isVoiceMessage(displayMsg);

  const caption = normalizeCaption(msg, bodies, userId);

  if (!hasMedia) {
    let text =
      caption || getMessagePreviewText(msg, bodies, userId).trim() || 'Forwarded message';
    if (isLikelyE2eeCiphertext(text)) text = 'Forwarded message';
    const preview = getMessageLinkPreview(msg, bodies);
    return {
      text,
      kind: 'TEXT',
      contentMeta: preview ? { preview } : undefined,
    };
  }

  if (isE2eeMessage(msg) && !files?.length && !isVoiceMessage(displayMsg)) {
    return {
      text: '',
      kind: 'FILE',
      blocked: true,
      blockedReason: 'Still decrypting attachments. Wait a moment and try again.',
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

  const cleanMeta = stripE2eeTransportFields(meta);
  const fileList = files ?? [];
  const allImages =
    fileList.length > 0 &&
    fileList.every((f) => isImageFile(f) || (f.mimetype ?? '').toLowerCase().startsWith('image/'));

  return {
    text: caption,
    kind: forwardMediaKind(displayMsg, allImages),
    contentMeta: Object.keys(cleanMeta).length ? cleanMeta : undefined,
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
