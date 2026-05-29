import type { Message } from '../chat/types';
import type { E2eeKeyMaterial } from './keyStore';
import { decryptDirectMessage, decryptDirectPayload } from './directChat';
import { decryptMessagePayload, resolveSenderFingerprint } from './decryptMessagePayload';
import { decryptGroupMessage } from './groupChat';
import { fetchGroupSenderKeys } from './groupSenderKeys';
import { isGroupE2eeMessage } from './protocol';
import {
  ensureSentPlaintextHydrated,
  getSentPlaintext,
  getSentPlaintextAsync,
} from './sentPlaintextCache';
import type { DmV1Payload } from './protocol';

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
    await ensureSentPlaintextHydrated(userId);
    const sent =
      getSentPlaintext(userId, msg) ?? (await getSentPlaintextAsync(userId, msg));
    if (sent !== undefined) {
      return { payload: { text: sent } };
    }
    if (isGroupE2eeMessage(msg)) {
      const meta = msg.contentMeta as Record<string, unknown> | undefined;
      const epoch = typeof meta?.epoch === 'number' ? meta.epoch : 0;
      await fetchGroupSenderKeys(msg.chatId, userId);
      const groupPayload = await decryptGroupMessage(
        msg.chatId,
        msg.senderId,
        msg.ciphertext ?? '',
        epoch,
        userId,
      );
      if (groupPayload) return { payload: groupPayload };
    }
    return { payload: null, reason: 'sent_plaintext_missing' };
  }

  if (isGroupE2eeMessage(msg)) {
    const meta = msg.contentMeta as Record<string, unknown> | undefined;
    const epoch = typeof meta?.epoch === 'number' ? meta.epoch : 0;
    await fetchGroupSenderKeys(msg.chatId, userId);
    let groupPayload = await decryptGroupMessage(
      msg.chatId,
      msg.senderId,
      msg.ciphertext ?? '',
      epoch,
      userId,
    );
    if (groupPayload) return { payload: groupPayload };

    fingerprintCache.delete(msg.senderId);
    groupPayload = await decryptGroupMessage(
      msg.chatId,
      msg.senderId,
      msg.ciphertext ?? '',
      epoch,
      userId,
    );
    if (groupPayload) return { payload: groupPayload };
    return { payload: null, reason: 'group_decrypt_failed' };
  }

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
