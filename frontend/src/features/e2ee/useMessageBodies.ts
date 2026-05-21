import { useEffect, useMemo, useState } from 'react';
import type { Message, LinkPreviewMeta } from '../chat/types';
import { useAuth } from '../../context/AuthContext';
import { decryptDirectMessage, isE2eeMessage } from './directChat';
import { decodeEnvelope, decodePayload, type DmV1Payload } from './protocol';
import { getSignedPreKeyPrivate, loadKeyMaterial } from './keyStore';
import { aesGcmDecrypt, deriveAesGcmKey, ecdhSharedSecret } from './crypto';
import * as e2eeApi from './e2eeApi';
import { getSentPlaintext, getSentPayloadMeta } from './sentPlaintextCache';
import { parseE2eePollMeta, type E2eePollPayload } from './pollMeta';

export type DecryptedBody = {
  text: string;
  preview?: LinkPreviewMeta;
  /** Inner payload meta (files, voiceNote, attachment keys) from E2EE decrypt or send cache. */
  meta?: Record<string, unknown>;
};

function metaHasMediaAttachments(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return false;
  if (meta.voiceNote || meta.mediaBlob) return true;
  const files = meta.files;
  if (Array.isArray(files) && files.length > 0) return true;
  if (typeof meta.filename === 'string' || typeof meta.url === 'string') return true;
  return false;
}

function messageHasMediaAttachments(
  msg: Message,
  meta?: Record<string, unknown>,
): boolean {
  if (msg.kind === 'IMAGE' || msg.kind === 'FILE') return true;
  if (metaHasMediaAttachments(meta)) return true;
  const transport = msg.contentMeta as Record<string, unknown> | undefined;
  if (metaHasMediaAttachments(transport)) return true;
  const refs = transport?.attachmentRefs as { files?: unknown } | undefined;
  return Array.isArray(refs?.files) && refs.files.length > 0;
}

/** Sender-side caption: empty for media-only (same as decrypted receiver payload). */
function senderE2eeDisplayText(
  msg: Message,
  sent: string | undefined,
  sentMeta: Record<string, unknown> | undefined,
): string {
  if (sent !== undefined) return sent;
  if (messageHasMediaAttachments(msg, sentMeta)) return '';
  return '';
}

async function decryptPayloadFull(
  userId: string,
  msg: Message,
): Promise<DmV1Payload | null> {
  const envelope = decodeEnvelope(msg.ciphertext ?? '');
  if (!envelope) return null;

  const material = await loadKeyMaterial(userId);
  if (!material) return null;

  const spkPrivate = await getSignedPreKeyPrivate(material, envelope.spkId);
  if (!spkPrivate) return null;

  const meta = msg.contentMeta as Record<string, unknown> | undefined;
  let fingerprint =
    typeof meta?.senderFingerprint === 'string' ? meta.senderFingerprint : null;
  if (!fingerprint) {
    try {
      const row = await e2eeApi.getIdentityKey(msg.senderId);
      fingerprint = row.fingerprint;
    } catch {
      return null;
    }
  }

  const shared = await ecdhSharedSecret(spkPrivate, envelope.ephemPub);
  const aesKey = await deriveAesGcmKey(shared, `${fingerprint}:${envelope.spkId}`);
  try {
    const plainBuf = await aesGcmDecrypt(aesKey, envelope.iv, envelope.ct);
    return decodePayload(plainBuf);
  } catch {
    return null;
  }
}

export function useMessageBodies(
  messages: Message[] | undefined,
): Record<string, DecryptedBody> {
  const { user } = useAuth();
  const [bodies, setBodies] = useState<Record<string, DecryptedBody>>({});

  const messagesKey = useMemo(
    () =>
      messages?.length
        ? messages.map((m) => `${m.id}:${m.ciphertext?.length ?? 0}`).join(',')
        : '',
    [messages],
  );

  useEffect(() => {
    if (!user?.id || !messages?.length) return;
    let cancelled = false;

    const run = async () => {
      const next: Record<string, DecryptedBody> = {};
      for (const msg of messages) {
        if (!isE2eeMessage(msg)) {
          if (msg.ciphertext != null) {
            next[msg.id] = { text: msg.ciphertext };
          }
          continue;
        }
        const sentMeta = getSentPayloadMeta(user.id, msg);
        const sent = getSentPlaintext(user.id, msg);

        if (msg.senderId === user.id) {
          const preview = sentMeta?.preview as LinkPreviewMeta | undefined;
          if (sent !== undefined || sentMeta) {
            next[msg.id] = {
              text: senderE2eeDisplayText(msg, sent, sentMeta),
              preview,
              meta: sentMeta,
            };
            continue;
          }
          next[msg.id] = { text: '' };
          continue;
        }

        const payload = await decryptPayloadFull(user.id, msg);
        if (payload) {
          const preview = payload.meta?.preview as LinkPreviewMeta | undefined;
          next[msg.id] = { text: payload.text, preview, meta: payload.meta };
          continue;
        }
        const plain = await decryptDirectMessage(user.id, msg, user.id);
        next[msg.id] = { text: plain ?? '[Unable to decrypt]' };
      }
      if (!cancelled) setBodies((prev) => ({ ...prev, ...next }));
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [messagesKey, user?.id]);

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

/** Merges E2EE inner payload meta (e.g. files[]) onto transport contentMeta for UI. */
export function getDecryptedTransportMeta(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
): Record<string, unknown> | undefined {
  if (!isE2eeMessage(msg)) return undefined;
  return bodies[msg.id]?.meta;
}

/** Decrypted poll copy from E2EE message payload or sender cache. */
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
  const cachedFiles = msg.contentMeta?.files;
  const decryptedFiles = meta?.files;
  const hasCachedFiles = Array.isArray(cachedFiles) && cachedFiles.length > 0;
  const hasDecryptedFiles = Array.isArray(decryptedFiles) && decryptedFiles.length > 0;

  if (!meta || !Object.keys(meta).length) {
    return msg;
  }

  return {
    ...msg,
    contentMeta: {
      ...(msg.contentMeta ?? {}),
      ...meta,
      ...(hasCachedFiles && !hasDecryptedFiles ? { files: cachedFiles } : {}),
    },
  };
}
