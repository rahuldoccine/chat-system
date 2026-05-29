import { aesGcmDecrypt, aesGcmEncrypt } from './crypto';
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
  getOwnSenderKeyFromServer,
  getRememberedSenderKey,
  publishSenderKey,
  rememberSenderKey,
} from './groupSenderKeys';

async function importRawAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function ensureGroupSenderKey(
  userId: string,
  chatId: string,
  memberUserIds: string[],
): Promise<Uint8Array> {
  const existing = getRememberedSenderKey(chatId, userId, 0);
  if (existing) return existing;

  const fromServer = await getOwnSenderKeyFromServer(userId, chatId, 0);
  if (fromServer) return fromServer;

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
  viewerUserId?: string,
): Promise<DmV1Payload | null> {
  const envelope = decodeGroupEnvelope(ciphertext);
  if (!envelope) return null;
  const targetEpoch = envelope.epoch ?? epoch;
  let key = getRememberedSenderKey(chatId, senderId, targetEpoch);
  if (!key && viewerUserId) {
    await fetchGroupSenderKeys(chatId, viewerUserId);
    key = getRememberedSenderKey(chatId, senderId, targetEpoch);
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
