import { useEffect, useMemo, useState } from 'react';
import type { Message, LinkPreviewMeta } from '../chat/types';
import { useAuth } from '../../context/AuthContext';
import { decryptDirectMessage, isE2eeMessage } from './directChat';
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

export type DecryptedBody = {
  text: string;
  preview?: LinkPreviewMeta;
  meta?: Record<string, unknown>;
};

const DECRYPT_CHUNK = 12;

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
  const transport = msg.contentMeta as Record<string, unknown> | undefined;
  if (metaHasMediaAttachments(transport)) return true;
  const refs = transport?.attachmentRefs as { files?: unknown } | undefined;
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

export function useMessageBodies(
  messages: Message[] | undefined,
): Record<string, DecryptedBody> {
  const { user, e2eeKeysLocked } = useAuth();
  const [bodies, setBodies] = useState<Record<string, DecryptedBody>>({});

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
    if (!user?.id || !messages?.length || e2eeKeysLocked) return;
    let cancelled = false;

    const run = async () => {
      await Promise.all([
        ensureSentPlaintextHydrated(user.id),
        ensureDecryptedPayloadHydrated(user.id),
      ]);

      const initial: Record<string, DecryptedBody> = {};
      const toDecrypt: Message[] = [];

      for (const msg of messages) {
        if (!isE2eeMessage(msg)) {
          if (msg.ciphertext != null) initial[msg.id] = { text: msg.ciphertext };
          continue;
        }

        const fp = ciphertextFingerprint(msg.ciphertext);

        if (msg.senderId === user.id) {
          const sent =
            getSentPlaintext(user.id, msg) ?? (await getSentPlaintextAsync(user.id, msg));
          const sentMeta = getSentPayloadMeta(user.id, msg);
          const preview = sentMeta?.preview as LinkPreviewMeta | undefined;
          if (sent !== undefined || sentMeta) {
            initial[msg.id] = {
              text: senderE2eeDisplayText(msg, sent, sentMeta),
              preview,
              meta: sentMeta,
            };
            continue;
          }
          initial[msg.id] = { text: '[Sent message unavailable on this device]' };
          continue;
        }

        const cached =
          getPayloadFromMemory(user.id, msg.id, fp) ??
          (await getPayloadCached(user.id, msg.id, fp));
        if (cached) {
          initial[msg.id] = cached;
        } else {
          toDecrypt.push(msg);
        }
      }

      if (!cancelled && Object.keys(initial).length) {
        setBodies((prev) => ({ ...prev, ...initial }));
      }

      if (!toDecrypt.length || cancelled) return;

      const material = await getLocalKeyMaterial(user.id);
      if (!material || cancelled) return;

      const fingerprintCache = new Map<string, string>();

      for (let i = 0; i < toDecrypt.length; i += DECRYPT_CHUNK) {
        if (cancelled) return;

        const chunk = toDecrypt.slice(i, i + DECRYPT_CHUNK);
        await Promise.all(
          chunk.map(async (msg) => {
            const fp = ciphertextFingerprint(msg.ciphertext);
            const payload = await decryptMessagePayload(
              user.id,
              msg,
              material,
              fingerprintCache,
            );

            let body: DecryptedBody;
            if (payload) {
              body = bodyFromPayload(payload);
              const senderDeviceId = (msg.contentMeta as Record<string, unknown> | undefined)
                ?.senderDeviceId;
              if (typeof senderDeviceId === 'string') {
                rememberPeerDevice(msg.senderId, senderDeviceId);
              }
              void rememberPayload(user.id, msg.id, fp, body);
            } else {
              const plain = await decryptDirectMessage(user.id, msg, user.id);
              body = { text: plain ?? '[Unable to decrypt]' };
            }

            if (cancelled) return;
            setBodies((prev) => ({ ...prev, [msg.id]: body }));
          }),
        );

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [messagesKey, user?.id, e2eeKeysLocked]);

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
