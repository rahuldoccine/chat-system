import api from '../../api/axios';
import { encryptDirectMessage } from './directChat';

export type SenderKeyRecord = {
  senderId: string;
  epoch: number;
  keyBytes: Uint8Array;
};

const localKeys = new Map<string, Uint8Array>();

function cacheKey(chatId: string, senderId: string, epoch: number) {
  return `${chatId}:${senderId}:${epoch}`;
}

export function rememberSenderKey(
  chatId: string,
  senderId: string,
  epoch: number,
  keyBytes: Uint8Array,
): void {
  localKeys.set(cacheKey(chatId, senderId, epoch), keyBytes);
}

export function getRememberedSenderKey(
  chatId: string,
  senderId: string,
  epoch: number,
): Uint8Array | undefined {
  return localKeys.get(cacheKey(chatId, senderId, epoch));
}

export async function fetchGroupSenderKeys(chatId: string): Promise<void> {
  const res = await api.get(`/e2ee/group-keys/${chatId}`);
  const rows = (res.data?.data ?? []) as Array<{
    senderId: string;
    epoch: number;
    distribution: string;
  }>;
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.distribution) as { key?: string };
      if (typeof parsed.key === 'string') {
        const raw = Uint8Array.from(atob(parsed.key), (c) => c.charCodeAt(0));
        rememberSenderKey(chatId, row.senderId, row.epoch, raw);
      }
    } catch {
      /* opaque to server; client may use pairwise-wrapped distributions later */
    }
  }
}

export async function publishSenderKey(
  userId: string,
  chatId: string,
  epoch: number,
  keyBytes: Uint8Array,
  memberUserIds: string[],
): Promise<void> {
  const keyB64 = btoa(String.fromCharCode(...keyBytes));
  const wrapped: Record<string, string> = {};
  for (const peerId of memberUserIds) {
    if (peerId === userId) continue;
    const enc = await encryptDirectMessage(userId, {
      peerUserId: peerId,
      plaintext: '',
      contentMeta: { groupSenderKey: { key: keyB64, epoch } },
    });
    wrapped[peerId] = enc.ciphertext;
  }
  const selfDistribution = JSON.stringify({ key: keyB64, epoch });
  await api.post(`/e2ee/group-keys/${chatId}`, {
    epoch,
    distribution: selfDistribution,
  });
  rememberSenderKey(chatId, userId, epoch, keyBytes);
  void wrapped;
}
