import React, { useEffect, useMemo, useState } from 'react';
import type { Message, LinkPreviewMeta } from '../chat/types';
import { useAuth } from '../../context/AuthContext';
import { decryptDirectMessage, isE2eeMessage } from './directChat';
import { isGroupE2eeMessage } from './protocol';
import { getLocalKeyMaterial } from './keyAccess';
import { rememberPeerDevice } from './peerDevice';
import {
  ensureSentPlaintextHydrated,
  getSentPlaintext,
  getSentPlaintextAsync,
  getSentPayloadMeta,
} from './sentPlaintextCache';
import {
  ciphertextFingerprint,
  ensureDecryptedPayloadHydrated,
  getPayloadCached,
  getPayloadFromMemory,
  rememberPayload,
} from './decryptedPayloadCache';
import { decryptMessagePayload } from './decryptMessagePayload';
import { mergeContentMetaWithStubs } from './transportFileStubs';
import { parseE2eePollMeta, type E2eePollPayload } from './pollMeta';
import { logDecryptFailure, retryDecryptMessage } from './decryptRetry';
import { onE2eeKeysUnlocked } from './e2eeEvents';

export type DecryptedBody = {
  text: string;
  preview?: LinkPreviewMeta;
  meta?: Record<string, unknown>;
};

const DECRYPT_CHUNK = 12;

async function decryptMessageChunk(
  chunk: Message[],
  userId: string,
  material: NonNullable<Awaited<ReturnType<typeof getLocalKeyMaterial>>>,
  fingerprintCache: Map<string, string>,
  isCancelled: () => boolean,
  onBody: (messageId: string, body: DecryptedBody) => void,
): Promise<void> {
  for (const msg of chunk) {
    if (isCancelled()) return;
    const body = await resolveDecryptedBody(userId, msg, material, fingerprintCache);
    if (isCancelled()) return;
    onBody(msg.id, body);
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

type SetBodiesFn = React.Dispatch<React.SetStateAction<Record<string, DecryptedBody>>>;

async function runMessageBodiesDecrypt(
  userId: string,
  messages: Message[],
  isCancelled: () => boolean,
  setBodies: SetBodiesFn,
): Promise<void> {
  await Promise.all([
    ensureSentPlaintextHydrated(userId),
    ensureDecryptedPayloadHydrated(userId),
  ]);

  const { initial, toDecrypt } = await partitionMessagesForDecrypt(messages, userId);

  if (!isCancelled() && Object.keys(initial).length) {
    setBodies((prev) => ({ ...prev, ...initial }));
  }

  if (!toDecrypt.length || isCancelled()) return;

  const material = await getLocalKeyMaterial(userId);
  if (!material || isCancelled()) return;

  const fingerprintCache = new Map<string, string>();
  const onBody = (messageId: string, body: DecryptedBody) => {
    setBodies((prev) => ({ ...prev, [messageId]: body }));
  };

  for (let i = 0; i < toDecrypt.length; i += DECRYPT_CHUNK) {
    if (isCancelled()) return;
    const chunk = toDecrypt.slice(i, i + DECRYPT_CHUNK);
    await decryptMessageChunk(chunk, userId, material, fingerprintCache, isCancelled, onBody);
  }
}

function metaHasMediaAttachments(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return false;
  if (meta.voiceNote || meta.mediaBlob) return true;
  const files = meta.files;
  if (Array.isArray(files) && files.length > 0) return true;
  if (typeof meta.filename === 'string' || typeof meta.url === 'string') return true;
  return false;
}

function messageHasMediaAttachments(msg: Message, meta?: Record<string, unknown>): boolean {
  if (msg.kind === 'IMAGE' || msg.kind === 'FILE') return true;
  if (metaHasMediaAttachments(meta)) return true;
  const transport = msg.contentMeta;
  if (metaHasMediaAttachments(transport)) return true;
  const refs = transport?.attachmentRefs;
  return Array.isArray(refs?.files) && refs.files.length > 0;
}

function senderE2eeDisplayText(
  msg: Message,
  sent: string | undefined,
  sentMeta: Record<string, unknown> | undefined,
): string {
  if (sent !== undefined) return sent;
  if (messageHasMediaAttachments(msg, sentMeta)) return '';
  return '';
}

function bodyFromPayload(payload: { text: string; meta?: Record<string, unknown> }): DecryptedBody {
  const preview = payload.meta?.preview as LinkPreviewMeta | undefined;
  return { text: payload.text, preview, meta: payload.meta };
}

function unavailableSenderBody(msg: Message): DecryptedBody {
  return {
    text: messageHasMediaAttachments(msg) ? '' : '[Sent message unavailable on this device]',
  };
}

function plaintextBodyForMessage(msg: Message): DecryptedBody | null {
  if (msg.ciphertext == null) return null;
  return { text: msg.ciphertext };
}

async function senderBodyFromCache(
  userId: string,
  msg: Message,
): Promise<DecryptedBody | null> {
  const sent = getSentPlaintext(userId, msg) ?? (await getSentPlaintextAsync(userId, msg));
  const sentMeta = getSentPayloadMeta(userId, msg);
  const preview = sentMeta?.preview as LinkPreviewMeta | undefined;
  if (sent === undefined && !sentMeta) return null;
  return {
    text: senderE2eeDisplayText(msg, sent, sentMeta),
    preview,
    meta: sentMeta,
  };
}

async function cachedPeerBody(
  userId: string,
  msg: Message,
  fp: string,
): Promise<DecryptedBody | null> {
  return (
    getPayloadFromMemory(userId, msg.id, fp) ?? (await getPayloadCached(userId, msg.id, fp))
  );
}

async function partitionMessagesForDecrypt(
  messages: Message[],
  userId: string,
): Promise<{ initial: Record<string, DecryptedBody>; toDecrypt: Message[] }> {
  const initial: Record<string, DecryptedBody> = {};
  const toDecrypt: Message[] = [];

  for (const msg of messages) {
    if (!isE2eeMessage(msg)) {
      const plain = plaintextBodyForMessage(msg);
      if (plain) initial[msg.id] = plain;
      continue;
    }

    const fp = ciphertextFingerprint(msg.ciphertext);

    if (msg.senderId === userId) {
      const senderBody = await senderBodyFromCache(userId, msg);
      if (senderBody) {
        initial[msg.id] = senderBody;
        continue;
      }
      toDecrypt.push(msg);
      continue;
    }

    const cached = await cachedPeerBody(userId, msg, fp);
    if (cached) {
      initial[msg.id] = cached;
      continue;
    }

    toDecrypt.push(msg);
  }

  return { initial, toDecrypt };
}

async function resolveDecryptedBody(
  userId: string,
  msg: Message,
  material: NonNullable<Awaited<ReturnType<typeof getLocalKeyMaterial>>>,
  fingerprintCache: Map<string, string>,
): Promise<DecryptedBody> {
  const fp = ciphertextFingerprint(msg.ciphertext);
  let payload = await decryptMessagePayload(userId, msg, material, fingerprintCache);

  if (!payload) {
    const retried = await retryDecryptMessage(userId, msg, material, fingerprintCache);
    payload = retried.payload;
    if (!payload) {
      logDecryptFailure(msg, retried.reason);
    }
  }

  if (payload) {
    const body = bodyFromPayload(payload);
    const senderDeviceId = msg.contentMeta?.senderDeviceId;
    if (typeof senderDeviceId === 'string') {
      rememberPeerDevice(msg.senderId, senderDeviceId);
    }
    void rememberPayload(userId, msg.id, fp, body);
    return body;
  }

  if (msg.senderId === userId) {
    return unavailableSenderBody(msg);
  }
  if (isGroupE2eeMessage(msg)) {
    return { text: '[Unable to decrypt]' };
  }

  const plain = await decryptDirectMessage(userId, msg, userId);
  return { text: plain ?? '[Unable to decrypt]' };
}

export function useMessageBodies(
  messages: Message[] | undefined,
): Record<string, DecryptedBody> {
  const { user, e2eeKeysLocked } = useAuth();
  const [bodies, setBodies] = useState<Record<string, DecryptedBody>>({});
  const [unlockGeneration, setUnlockGeneration] = useState(0);

  const messagesKey = useMemo(
    () =>
      messages?.length
        ? messages
            .map((m) => `${m.id}:${m.ciphertext?.length ?? 0}:${m.editedAt ?? ''}`)
            .join(',')
        : '',
    [messages],
  );

  useEffect(() => {
    if (!user?.id) return;
    return onE2eeKeysUnlocked((userId) => {
      if (userId === user.id) {
        setUnlockGeneration((n) => n + 1);
      }
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !messages?.length || e2eeKeysLocked) return;
    let cancelled = false;
    void runMessageBodiesDecrypt(user.id, messages, () => cancelled, setBodies);
    return () => {
      cancelled = true;
    };
  }, [messagesKey, user?.id, e2eeKeysLocked, unlockGeneration, messages]);

  return bodies;
}

export function getMessageDisplayBody(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
  userId: string,
): string {
  if (isE2eeMessage(msg)) {
    return bodies[msg.id]?.text ?? getSentPlaintext(userId, msg) ?? '…';
  }
  return msg.ciphertext ?? '';
}

export function getMessageLinkPreview(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
): LinkPreviewMeta | undefined {
  if (isE2eeMessage(msg)) {
    return bodies[msg.id]?.preview;
  }
  return msg.contentMeta?.preview;
}

export function getDecryptedTransportMeta(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
): Record<string, unknown> | undefined {
  if (!isE2eeMessage(msg)) return undefined;
  return bodies[msg.id]?.meta;
}

export function getDecryptedPollMeta(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
  userId: string,
): E2eePollPayload | null {
  if (!isE2eeMessage(msg)) return null;
  const fromBody = parseE2eePollMeta(bodies[msg.id]?.meta);
  if (fromBody) return fromBody;
  const sentMeta = getSentPayloadMeta(userId, msg);
  return parseE2eePollMeta(sentMeta);
}

export function messageWithDecryptedMeta(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
): Message {
  const meta = getDecryptedTransportMeta(msg, bodies);
  const mergedMeta = mergeContentMetaWithStubs(msg.contentMeta, meta);
  if (!mergedMeta) return msg;
  return { ...msg, contentMeta: mergedMeta };
}
