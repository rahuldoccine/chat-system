import type { Chat } from '../chat/types';
import { isDmE2eeChat } from './chatE2ee';
import { encryptDirectMessage, E2eePeerNotReadyError } from './directChat';

export type OutboundPlainMessage = {
  chatId: string;
  text?: string;
  kind?: string;
  contentMeta?: unknown;
  clientMessageId?: string;
  chat?: Pick<Chat, 'type' | 'e2eeMode' | 'dmPeer'> | null;
  peerUserId?: string;
};

export type PreparedOutbound = {
  ciphertext: string;
  contentMeta: unknown;
};

function fileRefFromRecord(
  rec: Record<string, unknown>,
): { uploadId?: string; filename?: string; url?: string } | null {
  const ref: { uploadId?: string; filename?: string; url?: string } = {};
  if (typeof rec.uploadId === 'string' && rec.uploadId) ref.uploadId = rec.uploadId;
  if (typeof rec.filename === 'string' && rec.filename) ref.filename = rec.filename;
  if (typeof rec.url === 'string' && rec.url) ref.url = rec.url;
  return ref.uploadId || ref.filename || ref.url ? ref : null;
}

/** Server-side file refs for purge on delete (no encryption keys). */
function buildAttachmentRefs(
  contentMeta: Record<string, unknown> | undefined,
): { files: Array<{ uploadId?: string; filename?: string; url?: string }> } | undefined {
  if (!contentMeta) return undefined;

  const files: Array<{ uploadId?: string; filename?: string; url?: string }> = [];
  const raw = contentMeta.files;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const ref = fileRefFromRecord(entry as Record<string, unknown>);
      if (ref) files.push(ref);
    }
  }

  const rootRef = fileRefFromRecord(contentMeta);
  if (rootRef && !files.some((f) => f.uploadId && f.uploadId === rootRef.uploadId)) {
    files.push(rootRef);
  }

  return files.length ? { files } : undefined;
}

export async function prepareOutboundMessage(
  userId: string,
  input: OutboundPlainMessage,
): Promise<PreparedOutbound> {
  const chat = input.chat;
  const peerUserId =
    input.peerUserId ?? (chat?.type === 'DIRECT' ? chat.dmPeer?.id : undefined);

  if (!isDmE2eeChat(chat ?? null) || !peerUserId) {
    return {
      ciphertext: input.text ?? '',
      contentMeta: input.contentMeta ?? null,
    };
  }

  const plainMeta =
    input.contentMeta && typeof input.contentMeta === 'object'
      ? (input.contentMeta as Record<string, unknown>)
      : undefined;
  const attachmentRefs = buildAttachmentRefs(plainMeta);

  try {
    const encrypted = await encryptDirectMessage(userId, {
      peerUserId,
      plaintext: input.text ?? '',
      contentMeta: plainMeta,
      clientMessageId: input.clientMessageId,
    });
    return {
      ciphertext: encrypted.ciphertext,
      contentMeta: attachmentRefs
        ? { ...encrypted.contentMeta, attachmentRefs }
        : encrypted.contentMeta,
    };
  } catch (err) {
    if (err instanceof E2eePeerNotReadyError) throw err;
    throw err;
  }
}

export type OutboundPollInput = {
  chat?: Pick<Chat, 'type' | 'e2eeMode' | 'dmPeer'> | null;
  peerUserId?: string;
  question: string;
  closesAt?: string | null;
  options: string[];
  clientMessageId?: string;
};

/** Encrypt poll question/options for E2EE DMs; server stores vote tallies only. */
export async function prepareOutboundPoll(
  userId: string,
  input: OutboundPollInput,
): Promise<PreparedOutbound> {
  const peerUserId =
    input.peerUserId ?? (input.chat?.type === 'DIRECT' ? input.chat.dmPeer?.id : undefined);
  if (!peerUserId) {
    throw new Error('E2EE poll requires a direct chat peer');
  }

  const encrypted = await encryptDirectMessage(userId, {
    peerUserId,
    plaintext: '',
    contentMeta: {
      poll: {
        question: input.question.trim(),
        closesAt: input.closesAt ?? null,
        options: input.options.map((label) => ({ label: label.trim() })),
      },
    },
    clientMessageId: input.clientMessageId,
  });

  return {
    ciphertext: encrypted.ciphertext,
    contentMeta: encrypted.contentMeta,
  };
}
