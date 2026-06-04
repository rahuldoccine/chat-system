import type { Message } from '../chat/types';
import { getSignedPreKeyPrivate, type E2eeKeyMaterial } from './keyStore';
import { decryptSenderCopy } from './senderCopy';
import { aesGcmDecrypt, deriveAesGcmKey, ecdhSharedSecret } from './crypto';
import { decodeEnvelope, decodePayload, isGroupE2eeMessage, type DmV1Payload } from './protocol';
import { decryptGroupMessage } from './groupChat';
import { isGroupDmE2eeMessage, resolveViewerCiphertext } from './groupDmChat';
import * as e2eeApi from './e2eeApi';
import { getPayloadFromMemory, setPayloadMemory, ciphertextFingerprint } from './decryptedPayloadCache';
import type { DecryptedBody } from './useMessageBodies';

export async function resolveSenderFingerprint(
  msg: Message,
  cache: Map<string, string>,
): Promise<string | null> {
  const meta = msg.contentMeta;
  if (typeof meta?.senderFingerprint === 'string') return meta.senderFingerprint;
  const hit = cache.get(msg.senderId);
  if (hit) return hit;
  try {
    const row = await e2eeApi.getIdentityKey(msg.senderId);
    cache.set(msg.senderId, row.fingerprint);
    return row.fingerprint;
  } catch {
    return null;
  }
}

async function decryptDmEnvelopeCiphertext(
  msg: Message,
  ciphertext: string,
  material: E2eeKeyMaterial,
  fingerprintCache: Map<string, string>,
): Promise<DmV1Payload | null> {
  const envelope = decodeEnvelope(ciphertext);
  if (!envelope) return null;

  const fingerprint = await resolveSenderFingerprint(msg, fingerprintCache);
  if (!fingerprint) return null;

  const spkIdsToTry = [
    envelope.spkId,
    ...material.signedPreKeys.map((k) => k.keyId).filter((id) => id !== envelope.spkId),
  ];

  for (const spkId of spkIdsToTry) {
    const spkPrivate = await getSignedPreKeyPrivate(material, spkId);
    if (!spkPrivate) continue;
    try {
      const shared = await ecdhSharedSecret(spkPrivate, envelope.ephemPub);
      const aesKey = await deriveAesGcmKey(shared, `${fingerprint}:${envelope.spkId}`);
      const plainBuf = await aesGcmDecrypt(aesKey, envelope.iv, envelope.ct);
      const payload = decodePayload(plainBuf);
      if (payload) return payload;
    } catch {
      /* try next key */
    }
  }
  return null;
}

export async function decryptMessagePayload(
  userId: string,
  msg: Message,
  material: E2eeKeyMaterial,
  fingerprintCache: Map<string, string>,
): Promise<DmV1Payload | null> {
  if (msg.senderId === userId) {
    const fromCopy = await decryptSenderCopy(material, msg);
    if (fromCopy) return fromCopy;
  }

  if (isGroupE2eeMessage(msg)) {
    const epoch = typeof msg.contentMeta?.epoch === 'number' ? msg.contentMeta.epoch : 0;
    return decryptGroupMessage(msg.chatId, msg.senderId, msg.ciphertext ?? '', epoch, userId);
  }

  if (isGroupDmE2eeMessage(msg)) {
    const viewerCt = resolveViewerCiphertext(msg, userId);
    if (!viewerCt) return null;
    return decryptDmEnvelopeCiphertext(msg, viewerCt, material, fingerprintCache);
  }

  return decryptDmEnvelopeCiphertext(msg, msg.ciphertext ?? '', material, fingerprintCache);
}

export function getCachedPayloadMeta(
  userId: string,
  msg: Message,
): Record<string, unknown> | undefined {
  const fp = ciphertextFingerprint(msg.ciphertext);
  return getPayloadFromMemory(userId, msg.id, fp)?.meta;
}

export function cachePayloadBody(
  userId: string,
  msg: Message,
  body: DecryptedBody,
): void {
  setPayloadMemory(userId, msg.id, ciphertextFingerprint(msg.ciphertext), body);
}
