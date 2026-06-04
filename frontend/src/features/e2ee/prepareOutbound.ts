import type { Chat } from '../chat/types';
import { buildPushPreview } from '../chat/utils/pushPreview';
import { isDmE2eeChat, isGroupE2eeChat } from './chatE2ee';
import { encryptGroupMessage } from './groupChat';
import { resolveGroupMemberIds } from './groupMembers';
import { GROUP_E2EE_VERSION } from './protocol';
import { ensureE2eeReady, E2eeKeysLockedError } from './bootstrap';
import { encryptDirectMessage, E2eePeerNotReadyError } from './directChat';
import { getRememberedPeerDevice } from './peerDevice';

export type OutboundPlainMessage = {
  chatId: string;
  text?: string;
  kind?: string;
  contentMeta?: unknown;
  clientMessageId?: string;
  chat?: Pick<Chat, 'type' | 'e2eeMode' | 'dmPeer'> | null;
  peerUserId?: string;
  groupMemberIds?: string[];
  /** Peer device from their latest message in this chat. */
  preferPeerDeviceId?: string | null;
};

export type PreparedOutbound = {
  ciphertext: string;
  contentMeta: unknown;
};

import { isPlainObject } from '../../utils/plainObject';

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
      if (!isPlainObject(entry)) continue;
      const ref = fileRefFromRecord(entry);
      if (ref) files.push(ref);
    }
  }

  const rootRef = fileRefFromRecord(contentMeta);
  if (rootRef && !files.some((f) => f.uploadId && f.uploadId === rootRef.uploadId)) {
    files.push(rootRef);
  }

  return files.length ? { files } : undefined;
}

function plainMetaFromInput(meta: unknown): Record<string, unknown> | undefined {
  return isPlainObject(meta) ? meta : undefined;
}

function mentionsMetaFromInput(
  meta: Record<string, unknown> | undefined,
): { userIds: string[]; all?: true } | undefined {
  const raw = meta?.mentions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const m = raw as { userIds?: unknown; all?: unknown };
  const userIds = Array.isArray(m.userIds)
    ? [...new Set(m.userIds.filter((id): id is string => typeof id === 'string'))]
    : [];
  const all = m.all === true;
  if (!all && userIds.length === 0) return undefined;
  return { userIds, ...(all ? { all: true as const } : {}) };
}

function resolveDmPeerUserId(
  chat: Pick<Chat, 'type' | 'dmPeer'> | null | undefined,
  peerUserId?: string,
): string | undefined {
  if (peerUserId) return peerUserId;
  if (chat?.type === 'DIRECT') return chat.dmPeer?.id;
  return undefined;
}

export async function prepareOutboundMessage(
  userId: string,
  input: OutboundPlainMessage,
  offlineMode = false,
): Promise<PreparedOutbound> {
  const chat = input.chat;
  const peerUserId = resolveDmPeerUserId(chat ?? null, input.peerUserId);

  if (isGroupE2eeChat(chat ?? null) && input.chatId) {
    await ensureE2eeReady(userId, { offline: offlineMode });
    const memberIds = await resolveGroupMemberIds(input.chatId, input.groupMemberIds);
    const plainMeta = plainMetaFromInput(input.contentMeta);
    const encrypted = await encryptGroupMessage(
      userId,
      input.chatId,
      memberIds,
      input.text ?? '',
      plainMeta,
    );
    const pushPreview = buildPushPreview({
      text: input.text,
      kind: input.kind,
      contentMeta: plainMeta,
    });
    const mentions = mentionsMetaFromInput(plainMeta);
    return {
      ciphertext: encrypted.ciphertext,
      contentMeta: {
        ...encrypted.contentMeta,
        e2eeVersion: GROUP_E2EE_VERSION,
        pushPreview,
        ...(mentions ? { mentions } : {}),
      },
    };
  }

  if (!isDmE2eeChat(chat ?? null) || !peerUserId) {
    return {
      ciphertext: input.text ?? '',
      contentMeta: input.contentMeta ?? null,
    };
  }

  const plainMeta = isPlainObject(input.contentMeta) ? input.contentMeta : undefined;
  const attachmentRefs = buildAttachmentRefs(plainMeta);

  try {
    await Promise.race([
      ensureE2eeReady(userId, { offline: offlineMode }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Encryption setup timed out. Try again.')),
          offlineMode ? 3_000 : 30_000,
        );
      }),
    ]);
    const preferPeerDeviceId =
      input.preferPeerDeviceId ?? getRememberedPeerDevice(peerUserId);
    const encrypted = await encryptDirectMessage(userId, {
      peerUserId,
      plaintext: input.text ?? '',
      contentMeta: plainMeta,
      clientMessageId: input.clientMessageId,
      preferPeerDeviceId,
      offline: offlineMode,
    });
    const pushPreview = buildPushPreview({
      text: input.text,
      kind: input.kind,
      contentMeta: plainMeta,
    });
    return {
      ciphertext: encrypted.ciphertext,
      contentMeta: {
        ...encrypted.contentMeta,
        ...(attachmentRefs ? { attachmentRefs } : {}),
        pushPreview,
      },
    };
  } catch (err) {
    if (err instanceof E2eePeerNotReadyError || err instanceof E2eeKeysLockedError) {
      throw err;
    }
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
  preferPeerDeviceId?: string | null;
};

/** Encrypt poll question/options for E2EE DMs; server stores vote tallies only. */
export async function prepareOutboundPoll(
  userId: string,
  input: OutboundPollInput,
  offlineMode = false,
): Promise<PreparedOutbound> {
  const peerUserId = resolveDmPeerUserId(input.chat ?? null, input.peerUserId);
  if (!peerUserId) {
    throw new Error('E2EE poll requires a direct chat peer');
  }

  await Promise.race([
    ensureE2eeReady(userId, { offline: offlineMode }),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Encryption setup timed out. Try again.')),
        offlineMode ? 3_000 : 30_000,
      );
    }),
  ]);
  const preferPeerDeviceId =
    input.preferPeerDeviceId ?? getRememberedPeerDevice(peerUserId);
  const encrypted = await encryptDirectMessage(userId, {
    peerUserId,
    plaintext: '',
    preferPeerDeviceId,
    offline: offlineMode,
    contentMeta: {
      poll: {
        question: input.question.trim(),
        closesAt: input.closesAt ?? null,
        options: input.options.map((label) => ({ label: label.trim() })),
      },
    },
    clientMessageId: input.clientMessageId,
  });

  const pushPreview = buildPushPreview({
    text: '',
    kind: 'POLL',
    contentMeta: {
      poll: {
        question: input.question.trim(),
        closesAt: input.closesAt ?? null,
        options: input.options.map((label) => ({ label: label.trim() })),
      },
    },
  });

  return {
    ciphertext: encrypted.ciphertext,
    contentMeta: { ...encrypted.contentMeta, pushPreview },
  };
}
