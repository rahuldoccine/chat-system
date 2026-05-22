import { aesGcmDecrypt, aesGcmEncrypt } from './crypto';
import { bufToB64, b64ToBuf } from './encoding';
import {
  exportKeyMaterialJson,
  importKeyMaterialJson,
  type E2eeKeyMaterial,
} from './keyStore';

const BROWSER_SESSION_KEY = 'e2ee-browser-session-key';
const UNLOCK_PREFIX = 'e2ee-session-unlock:';

async function getBrowserSessionAesKey(): Promise<CryptoKey> {
  let rawB64 = sessionStorage.getItem(BROWSER_SESSION_KEY);
  if (!rawB64) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    rawB64 = bufToB64(bytes.buffer);
    sessionStorage.setItem(BROWSER_SESSION_KEY, rawB64);
  }
  return crypto.subtle.importKey('raw', b64ToBuf(rawB64), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Survives page refresh while the browser tab session is open (cleared when the tab closes). */
export async function persistSessionUnlock(
  userId: string,
  material: E2eeKeyMaterial,
): Promise<void> {
  if (typeof sessionStorage === 'undefined') return;
  const json = await exportKeyMaterialJson(material);
  const key = await getBrowserSessionAesKey();
  const { iv, ct } = await aesGcmEncrypt(key, new TextEncoder().encode(json));
  sessionStorage.setItem(`${UNLOCK_PREFIX}${userId}`, JSON.stringify({ iv, ct }));
}

export async function restoreSessionUnlock(userId: string): Promise<E2eeKeyMaterial | null> {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(`${UNLOCK_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    const { iv, ct } = JSON.parse(raw) as { iv: string; ct: string };
    const key = await getBrowserSessionAesKey();
    const plain = await aesGcmDecrypt(key, iv, ct);
    const json = new TextDecoder().decode(plain);
    return importKeyMaterialJson(userId, json);
  } catch {
    sessionStorage.removeItem(`${UNLOCK_PREFIX}${userId}`);
    return null;
  }
}

export function clearSessionUnlock(userId?: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (userId) {
    sessionStorage.removeItem(`${UNLOCK_PREFIX}${userId}`);
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(UNLOCK_PREFIX)) keys.push(k);
  }
  for (const k of keys) sessionStorage.removeItem(k);
  sessionStorage.removeItem(BROWSER_SESSION_KEY);
}
