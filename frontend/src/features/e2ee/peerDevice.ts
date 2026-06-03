import { isPlainObject } from '../../utils/plainObject';
import type { DeviceRow } from './e2eeApi';

const STORAGE_PREFIX = 'e2ee-peer-device:';

/** Remember which device id a peer is actively using (from their message contentMeta). */
export function rememberPeerDevice(peerUserId: string, deviceId: string): void {
  if (!peerUserId || !deviceId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${peerUserId}`, deviceId);
  } catch {
    /* quota / private mode */
  }
}

/** Latest device id the peer sent from (walk messages newest-first). */
export function latestPeerSenderDeviceId(
  messages: Array<{ senderId: string; contentMeta?: unknown }> | undefined,
  peerUserId: string,
): string | null {
  if (!messages?.length) return null;
  for (const msg of messages.toReversed()) {
    if (msg.senderId !== peerUserId) continue;
    if (!isPlainObject(msg.contentMeta)) continue;
    const id = msg.contentMeta.senderDeviceId;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

export function getRememberedPeerDevice(peerUserId: string): string | null {
  if (!peerUserId || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${peerUserId}`);
  } catch {
    return null;
  }
}

function deviceSortTime(row: DeviceRow): number {
  const raw = row.updatedAt ?? row.createdAt;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

export type PickPeerDeviceOptions = {
  /** Device id the peer used in their latest message (contentMeta.senderDeviceId). */
  preferDeviceId?: string | null;
};

/**
 * Pick which device to encrypt to. Stale localStorage memory must not beat a newer peer device
 * (e.g. peer logged in on incognito) or messages show [Unable to decrypt].
 */
export function pickPeerDeviceId(
  peerUserId: string,
  devices: DeviceRow[],
  options: PickPeerDeviceOptions = {},
): string | null {
  if (!devices.length) return null;

  const byId = new Map(devices.map((d) => [d.deviceId, d]));
  const sorted = [...devices].sort((a, b) => deviceSortTime(b) - deviceSortTime(a));
  const newestId = sorted[0]?.deviceId ?? null;

  const prefer = options.preferDeviceId;
  // Only honor prefer when it is the newest device (avoids stale senderDeviceId from old sessions).
  if (prefer && byId.has(prefer) && prefer === newestId) {
    return prefer;
  }

  const remembered = getRememberedPeerDevice(peerUserId);
  if (remembered && byId.has(remembered) && remembered === newestId) {
    return remembered;
  }

  return newestId;
}

/** Device ids to try when fetching a pre-key bundle (newest first). */
export function orderedPeerDeviceIds(
  peerUserId: string,
  devices: DeviceRow[],
  preferDeviceId?: string | null,
): string[] {
  if (!devices.length) return [];
  const primary = pickPeerDeviceId(peerUserId, devices, { preferDeviceId });
  if (!primary) return [];
  const byId = new Map(devices.map((d) => [d.deviceId, d]));
  const sorted = [...devices].sort((a, b) => deviceSortTime(b) - deviceSortTime(a));
  const ids: string[] = [primary];
  for (const d of sorted) {
    if (d.deviceId !== primary && byId.has(d.deviceId)) ids.push(d.deviceId);
  }
  return ids;
}
