import type { PreKeyBundle } from './e2eeApi';

const CACHE_PREFIX = 'e2ee-peer-bundle:';

type CachedBundle = {
  bundle: PreKeyBundle;
  cachedAt: number;
};

export function cachePeerPreKeyBundle(
  peerUserId: string,
  deviceId: string,
  bundle: PreKeyBundle,
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const payload: CachedBundle = { bundle, cachedAt: Date.now() };
    sessionStorage.setItem(`${CACHE_PREFIX}${peerUserId}:${deviceId}`, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function getCachedPeerPreKeyBundle(
  peerUserId: string,
  deviceId: string,
): PreKeyBundle | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${peerUserId}:${deviceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBundle;
    return parsed?.bundle ?? null;
  } catch {
    return null;
  }
}
