import type { Message } from '../chat/types';
import type { E2eeKeyMaterial } from './keyStore';
import { decryptDirectMessage, decryptDirectPayload } from './directChat';
import { decryptMessagePayload, resolveSenderFingerprint } from './decryptMessagePayload';
import { decryptGroupMessage } from './groupChat';
import { fetchGroupSenderKeys } from './groupSenderKeys';
import { isGroupE2eeMessage, type DmV1Payload } from './protocol';
import {
  ensureSentPlaintextHydrated,
  getSentPlaintext,
  getSentPlaintextAsync,
} from './sentPlaintextCache';

export type DecryptFailReason =
  | 'keys_locked'
  | 'no_material'
  | 'sent_plaintext_missing'
  | 'dm_decrypt_failed'
  | 'group_decrypt_failed';

export type DecryptRetryResult = {
  payload: DmV1Payload | null;
  reason?: DecryptFailReason;
};

function groupMessageEpoch(msg: Message): number {
  return typeof msg.contentMeta?.epoch === 'number' ? msg.contentMeta.epoch : 0;
}

async function decryptGroupPayload(userId: string, msg: Message): Promise<DmV1Payload | null> {
  const epoch = groupMessageEpoch(msg);
  await fetchGroupSenderKeys(msg.chatId, userId);
  return decryptGroupMessage(
    msg.chatId,
    msg.senderId,
    msg.ciphertext ?? '',
    epoch,
    userId,
  );
}

async function retryOwnSenderMessage(
  userId: string,
  msg: Message,
): Promise<DecryptRetryResult | null> {
  await ensureSentPlaintextHydrated(userId);
  const sent = getSentPlaintext(userId, msg) ?? (await getSentPlaintextAsync(userId, msg));
  if (sent !== undefined) {
    return { payload: { text: sent } };
  }
  if (!isGroupE2eeMessage(msg)) {
    return null;
  }
  const groupPayload = await decryptGroupPayload(userId, msg);
  if (groupPayload) return { payload: groupPayload };
  return null;
}

async function retryIncomingGroupMessage(
  userId: string,
  msg: Message,
  fingerprintCache: Map<string, string>,
): Promise<DecryptRetryResult> {
  let groupPayload = await decryptGroupPayload(userId, msg);
  if (groupPayload) return { payload: groupPayload };

  fingerprintCache.delete(msg.senderId);
  groupPayload = await decryptGroupPayload(userId, msg);
  if (groupPayload) return { payload: groupPayload };
  return { payload: null, reason: 'group_decrypt_failed' };
}

async function retryIncomingDmMessage(
  userId: string,
  msg: Message,
  material: E2eeKeyMaterial,
  fingerprintCache: Map<string, string>,
): Promise<DecryptRetryResult> {
  fingerprintCache.delete(msg.senderId);
  await resolveSenderFingerprint(msg, fingerprintCache);

  let payload = await decryptMessagePayload(userId, msg, material, fingerprintCache);
  if (payload) return { payload };

  const dmPayload = await decryptDirectPayload(userId, msg, userId);
  if (dmPayload) return { payload: dmPayload };

  const plain = await decryptDirectMessage(userId, msg, userId);
  if (plain !== null) return { payload: { text: plain } };

  return { payload: null, reason: 'dm_decrypt_failed' };
}

export async function retryDecryptMessage(
  userId: string,
  msg: Message,
  material: E2eeKeyMaterial | null,
  fingerprintCache: Map<string, string>,
): Promise<DecryptRetryResult> {
  if (!material) {
    return { payload: null, reason: 'no_material' };
  }

  if (msg.senderId === userId) {
    const own = await retryOwnSenderMessage(userId, msg);
    if (own) return own;
    return { payload: null, reason: 'sent_plaintext_missing' };
  }

  if (isGroupE2eeMessage(msg)) {
    return retryIncomingGroupMessage(userId, msg, fingerprintCache);
  }

  return retryIncomingDmMessage(userId, msg, material, fingerprintCache);
}

export function logDecryptFailure(
  msg: Message,
  reason: DecryptFailReason | undefined,
): void {
  console.warn('[e2ee-decrypt-fail]', {
    messageId: msg.id,
    chatId: msg.chatId,
    senderId: msg.senderId,
    reason: reason ?? 'unknown',
  });
}
