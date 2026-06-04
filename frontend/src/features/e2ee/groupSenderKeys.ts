import api from '../../api/axios';
import { decryptDirectPayload, encryptDirectMessage } from './directChat';
import { listPeerDevices } from './e2eeApi';
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

export class GroupKeyDistributionError extends Error {
  readonly failedMemberIds: string[];

  constructor(failedMemberIds: string[]) {
    const count = failedMemberIds.length;
    super(
      count === 1
        ? 'Could not share encryption keys with one group member. They may need to sign in and finish encryption setup.'
        : `Could not share encryption keys with ${count} group members. They may need to sign in and finish encryption setup.`,
    );
    this.name = 'GroupKeyDistributionError';
    this.failedMemberIds = failedMemberIds;
  }
}

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
  /** Legacy: one ciphertext per member. New: deviceId → ciphertext for multi-device members. */
  wrapped?: Record<string, string | Record<string, string>>;
  key?: string;
  epoch?: number;
};

async function unwrapSenderKeyCiphertext(
  viewerUserId: string,
  senderId: string,
  epoch: number,
  ciphertext: string,
  chatId: string,
): Promise<boolean> {
  const payload = await decryptDirectPayload(
    viewerUserId,
    {
      id: `group-key-${senderId}-${epoch}`,
      ciphertext,
      senderId,
      contentMeta: {},
    },
    viewerUserId,
  );
  const meta = payload?.meta as { groupSenderKey?: { key?: string } } | undefined;
  const keyB64 = meta?.groupSenderKey?.key;
  if (typeof keyB64 !== 'string') return false;
  rememberSenderKey(chatId, senderId, epoch, keyBytesFromB64(keyB64));
  return true;
}

async function unwrapWrappedEntryForViewer(
  viewerUserId: string,
  senderId: string,
  epoch: number,
  entry: string | Record<string, string>,
  chatId: string,
): Promise<boolean> {
  if (typeof entry === 'string') {
    return unwrapSenderKeyCiphertext(viewerUserId, senderId, epoch, entry, chatId);
  }
  for (const ciphertext of Object.values(entry)) {
    if (typeof ciphertext !== 'string') continue;
    if (await unwrapSenderKeyCiphertext(viewerUserId, senderId, epoch, ciphertext, chatId)) {
      return true;
    }
  }
  return false;
}

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
    const wrappedEntry = parsed.wrapped?.[viewerUserId];
    if (wrappedEntry) {
      await unwrapWrappedEntryForViewer(
        viewerUserId,
        row.senderId,
        row.epoch,
        wrappedEntry,
        row.chatId,
      );
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

async function peerDeviceCount(peerId: string): Promise<number> {
  try {
    const devices = await listPeerDevices(peerId);
    return devices.length;
  } catch {
    return 0;
  }
}

async function memberWrapNeedsUpgrade(
  peerId: string,
  entry: string | Record<string, string> | undefined,
): Promise<boolean> {
  if (!entry) return true;
  const deviceCount = await peerDeviceCount(peerId);
  if (deviceCount > 1 && typeof entry === 'string') return true;
  return false;
}

async function wrapSenderKeyForMember(
  userId: string,
  peerId: string,
  keyB64: string,
  epoch: number,
): Promise<string | Record<string, string> | null> {
  let devices: Awaited<ReturnType<typeof listPeerDevices>> = [];
  try {
    devices = await listPeerDevices(peerId);
  } catch {
    devices = [];
  }

  const meta = { groupSenderKey: { key: keyB64, epoch } };
  const byDevice: Record<string, string> = {};

  for (const device of devices) {
    try {
      const enc = await encryptDirectMessage(userId, {
        peerUserId: peerId,
        preferPeerDeviceId: device.deviceId,
        plaintext: '',
        contentMeta: meta,
      });
      byDevice[device.deviceId] = enc.ciphertext;
    } catch {
      /* try other devices */
    }
  }

  if (Object.keys(byDevice).length > 1) return byDevice;
  if (Object.keys(byDevice).length === 1) {
    return Object.values(byDevice)[0] ?? null;
  }

  try {
    const enc = await encryptDirectMessage(userId, {
      peerUserId: peerId,
      plaintext: '',
      contentMeta: meta,
    });
    return enc.ciphertext;
  } catch {
    return null;
  }
}

/** Re-publish when earlier distributions omitted members or only wrapped one of a member's devices. */
export async function ensureSenderKeyDistributed(
  userId: string,
  chatId: string,
  epoch: number,
  keyBytes: Uint8Array,
  memberUserIds: string[],
): Promise<void> {
  const members = memberUserIds.filter((id) => id && id !== userId);
  if (!members.length) return;

  await ensureIdbHydrated();
  const res = await api.get(`/e2ee/group-keys/${chatId}`);
  const rows = (res.data?.data ?? []) as Array<{
    senderId: string;
    epoch: number;
    distribution: string;
  }>;
  const own = rows.find((r) => r.senderId === userId && r.epoch === epoch);
  let needsRepublish = !own;

  if (own?.distribution) {
    try {
      const parsed = JSON.parse(own.distribution) as DistributionV2;
      if (parsed.v === 2 && parsed.wrapped) {
        for (const memberId of members) {
          const entry = parsed.wrapped[memberId];
          if (!entry) {
            needsRepublish = true;
            break;
          }
          if (await memberWrapNeedsUpgrade(memberId, entry)) {
            needsRepublish = true;
            break;
          }
        }
      } else {
        needsRepublish = true;
      }
    } catch {
      needsRepublish = true;
    }
  }

  if (needsRepublish) {
    await publishSenderKey(userId, chatId, epoch, keyBytes, memberUserIds);
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
  const wrapped: Record<string, string | Record<string, string>> = {};
  const failedMemberIds: string[] = [];
  for (const peerId of memberUserIds) {
    if (peerId === userId) continue;
    const entry = await wrapSenderKeyForMember(userId, peerId, keyB64, epoch);
    if (entry) {
      wrapped[peerId] = entry;
    } else {
      failedMemberIds.push(peerId);
    }
  }
  if (failedMemberIds.length) {
    throw new GroupKeyDistributionError(failedMemberIds);
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
