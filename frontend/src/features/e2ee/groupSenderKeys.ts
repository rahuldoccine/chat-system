import api from '../../api/axios';
import { decryptDirectPayload, encryptDirectMessage } from './directChat';
import {
  idbLoadGroupSenderKeys,
  idbPutGroupSenderKey,
  type GroupSenderKeyIdbRow,
} from './groupSenderKeysIdb';

export type SenderKeyRecord = {
  senderId: string;
  epoch: number;
  keyBytes: Uint8Array;
};

const localKeys = new Map<string, Uint8Array>();

let idbHydrated = false;
let idbHydratePromise: Promise<void> | null = null;

function cacheKey(chatId: string, senderId: string, epoch: number) {
  return `${chatId}:${senderId}:${epoch}`;
}

function keyBytesToB64(keyBytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...keyBytes));
}

function keyBytesFromB64(keyB64: string): Uint8Array {
  return Uint8Array.from(atob(keyB64), (c) => c.codePointAt(0) ?? 0);
}

async function ensureIdbHydrated(): Promise<void> {
  if (idbHydrated) return;
  idbHydratePromise ??= (async () => {
      const rows = await idbLoadGroupSenderKeys();
      for (const row of rows) {
        localKeys.set(
          cacheKey(row.chatId, row.senderId, row.epoch),
          keyBytesFromB64(row.keyB64),
        );
      }
      idbHydrated = true;
    })().finally(() => {
      idbHydratePromise = null;
    });
  await idbHydratePromise;
}

export function rememberSenderKey(
  chatId: string,
  senderId: string,
  epoch: number,
  keyBytes: Uint8Array,
): void {
  localKeys.set(cacheKey(chatId, senderId, epoch), keyBytes);
  void idbPutGroupSenderKey({
    chatId,
    senderId,
    epoch,
    keyB64: keyBytesToB64(keyBytes),
  });
}

export function getRememberedSenderKey(
  chatId: string,
  senderId: string,
  epoch: number,
): Uint8Array | undefined {
  return localKeys.get(cacheKey(chatId, senderId, epoch));
}

type DistributionV2 = {
  v?: number;
  self?: { key?: string; epoch?: number };
  wrapped?: Record<string, string>;
  key?: string;
  epoch?: number;
};

async function parseDistributionRow(
  viewerUserId: string,
  row: { chatId: string; senderId: string; epoch: number; distribution: string },
): Promise<void> {
  let parsed: DistributionV2;
  try {
    parsed = JSON.parse(row.distribution) as DistributionV2;
  } catch {
    return;
  }

  if (parsed.v === 2) {
    if (row.senderId === viewerUserId && typeof parsed.self?.key === 'string') {
      rememberSenderKey(row.chatId, row.senderId, row.epoch, keyBytesFromB64(parsed.self.key));
      return;
    }
    const wrapped = parsed.wrapped?.[viewerUserId];
    if (wrapped) {
      const payload = await decryptDirectPayload(viewerUserId, {
        id: `group-key-${row.senderId}-${row.epoch}`,
        ciphertext: wrapped,
        senderId: row.senderId,
        contentMeta: {},
      }, viewerUserId);
      const meta = payload?.meta as { groupSenderKey?: { key?: string } } | undefined;
      const keyB64 = meta?.groupSenderKey?.key;
      if (typeof keyB64 === 'string') {
        rememberSenderKey(row.chatId, row.senderId, row.epoch, keyBytesFromB64(keyB64));
      }
      return;
    }
  }

  if (typeof parsed.key === 'string') {
    rememberSenderKey(row.chatId, row.senderId, row.epoch, keyBytesFromB64(parsed.key));
  }
}

export async function hydrateGroupSenderKeysFromIdb(): Promise<void> {
  await ensureIdbHydrated();
}

export async function fetchGroupSenderKeys(
  chatId: string,
  viewerUserId: string,
): Promise<void> {
  await ensureIdbHydrated();
  const res = await api.get(`/e2ee/group-keys/${chatId}`);
  const rows = (res.data?.data ?? []) as Array<{
    senderId: string;
    epoch: number;
    distribution: string;
  }>;
  for (const row of rows) {
    await parseDistributionRow(viewerUserId, { ...row, chatId });
  }
}

export async function publishSenderKey(
  userId: string,
  chatId: string,
  epoch: number,
  keyBytes: Uint8Array,
  memberUserIds: string[],
): Promise<void> {
  await ensureIdbHydrated();
  const keyB64 = keyBytesToB64(keyBytes);
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
  const distribution = JSON.stringify({
    v: 2,
    self: { key: keyB64, epoch },
    wrapped,
  });
  await api.post(`/e2ee/group-keys/${chatId}`, {
    epoch,
    distribution,
  });
  rememberSenderKey(chatId, userId, epoch, keyBytes);
}

export async function getOwnSenderKeyFromServer(
  userId: string,
  chatId: string,
  epoch = 0,
): Promise<Uint8Array | undefined> {
  await fetchGroupSenderKeys(chatId, userId);
  return getRememberedSenderKey(chatId, userId, epoch);
}

export function exportGroupSenderKeysForBackup(): GroupSenderKeyIdbRow[] {
  const rows: GroupSenderKeyIdbRow[] = [];
  for (const [key, bytes] of localKeys.entries()) {
    const [chatId, senderId, epochStr] = key.split(':');
    if (!chatId || !senderId || !epochStr) continue;
    rows.push({
      chatId,
      senderId,
      epoch: Number(epochStr),
      keyB64: keyBytesToB64(bytes),
    });
  }
  return rows;
}
