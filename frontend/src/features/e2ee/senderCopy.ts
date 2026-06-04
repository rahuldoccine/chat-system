import type { Message } from '../chat/types';
import { aesGcmDecrypt, aesGcmEncrypt, deriveAesGcmKey, ecdhSharedSecret } from './crypto';
import { getIdentityPrivate, type E2eeKeyMaterial } from './keyStore';
import { decodePayload, encodePayload, type DmV1Payload } from './protocol';

export const SENDER_COPY_VERSION = 1;

export type SenderCopyMeta = {
  v: typeof SENDER_COPY_VERSION;
  iv: string;
  ct: string;
};

function senderCopySalt(userId: string): string {
  return `sender-copy:${userId}`;
}

async function deriveSenderCopyAesKey(material: E2eeKeyMaterial): Promise<CryptoKey> {
  const identityPriv = await getIdentityPrivate(material);
  const shared = await ecdhSharedSecret(identityPriv, material.identityPublicSpki);
  return deriveAesGcmKey(shared, senderCopySalt(material.userId));
}

export async function buildSenderCopyMeta(
  material: E2eeKeyMaterial,
  payload: DmV1Payload,
): Promise<SenderCopyMeta> {
  const key = await deriveSenderCopyAesKey(material);
  const { iv, ct } = await aesGcmEncrypt(key, encodePayload(payload));
  return { v: SENDER_COPY_VERSION, iv, ct };
}

export async function decryptSenderCopy(
  material: E2eeKeyMaterial,
  msg: Pick<Message, 'contentMeta'>,
): Promise<DmV1Payload | null> {
  const raw = msg.contentMeta?.senderCopy;
  if (!raw || typeof raw !== 'object') return null;
  const copy = raw as Partial<SenderCopyMeta>;
  if (copy.v !== SENDER_COPY_VERSION || typeof copy.iv !== 'string' || typeof copy.ct !== 'string') {
    return null;
  }
  try {
    const key = await deriveSenderCopyAesKey(material);
    const plainBuf = await aesGcmDecrypt(key, copy.iv, copy.ct);
    return decodePayload(plainBuf);
  } catch {
    return null;
  }
}
