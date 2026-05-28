import { aesGcmDecrypt, aesGcmEncrypt } from './crypto';

async function importRawAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
import {
  decodeGroupEnvelope,
  encodeGroupEnvelope,
  encodePayload,
  decodePayload,
  GROUP_E2EE_VERSION,
  type DmV1Payload,
} from './protocol';
import {
  fetchGroupSenderKeys,
  getRememberedSenderKey,
  publishSenderKey,
  rememberSenderKey,
} from './groupSenderKeys';

export async function ensureGroupSenderKey(
  userId: string,
  chatId: string,
  memberUserIds: string[],
): Promise<Uint8Array> {
  const existing = getRememberedSenderKey(chatId, userId, 0);
  if (existing) return existing;
  const key = crypto.getRandomValues(new Uint8Array(32));
  await publishSenderKey(userId, chatId, 0, key, memberUserIds);
  rememberSenderKey(chatId, userId, 0, key);
  return key;
}

export async function encryptGroupMessage(
  userId: string,
  chatId: string,
  memberUserIds: string[],
  plaintext: string,
  meta?: Record<string, unknown>,
): Promise<{ ciphertext: string; contentMeta: Record<string, unknown> }> {
  const keyBytes = await ensureGroupSenderKey(userId, chatId, memberUserIds);
  const aesKey = await importRawAesKey(keyBytes);
  const payload = encodePayload({ text: plaintext, meta });
  const { iv, ct } = await aesGcmEncrypt(aesKey, payload);
  return {
    ciphertext: encodeGroupEnvelope({
      v: GROUP_E2EE_VERSION,
      senderId: userId,
      epoch: 0,
      iv,
      ct,
    }),
    contentMeta: { e2eeVersion: GROUP_E2EE_VERSION, senderId: userId, epoch: 0 },
  };
}

export async function decryptGroupMessage(
  chatId: string,
  senderId: string,
  ciphertext: string,
  epoch = 0,
): Promise<DmV1Payload | null> {
  const envelope = decodeGroupEnvelope(ciphertext);
  if (!envelope) return null;
  let key = getRememberedSenderKey(chatId, senderId, envelope.epoch ?? epoch);
  if (!key) {
    await fetchGroupSenderKeys(chatId);
    key = getRememberedSenderKey(chatId, senderId, envelope.epoch ?? epoch);
  }
  if (!key) return null;
  try {
    const aesKey = await importRawAesKey(key);
    const plain = await aesGcmDecrypt(aesKey, envelope.iv, envelope.ct);
    return decodePayload(plain);
  } catch {
    return null;
  }
}
