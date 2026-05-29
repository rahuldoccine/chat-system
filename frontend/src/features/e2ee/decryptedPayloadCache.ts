import type { LinkPreviewMeta } from '../chat/types';
import type { DecryptedBody } from './useMessageBodies';

const DB_NAME = 'chat-e2ee-payload-v1';
const DB_VERSION = 1;
const STORE = 'payloads';
const MAX_ENTRIES = 5000;

export type CachedPayloadEntry = DecryptedBody & {
  /** Invalidate when ciphertext changes (edit / resend). */
  ctFingerprint: string;
};

const memory = new Map<string, CachedPayloadEntry>();
let hydratedUserId: string | null = null;
let hydratePromise: Promise<void> | null = null;

function cacheKey(userId: string, messageId: string): string {
  return `${userId}:m:${messageId}`;
}

/** Cheap fingerprint — must change when envelope bytes change. */
export function ciphertextFingerprint(ciphertext: string | null | undefined): string {
  const ct = ciphertext ?? '';
  if (!ct) return '0';
  return `${ct.length}:${ct.slice(0, 48)}:${ct.slice(-16)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

export function getPayloadFromMemory(
  userId: string,
  messageId: string,
  ctFingerprint: string,
): DecryptedBody | null {
  const hit = memory.get(cacheKey(userId, messageId));
  if (!hit || hit.ctFingerprint !== ctFingerprint) return null;
  const { ctFingerprint: _fp, ...body } = hit;
  return body;
}

export function setPayloadMemory(
  userId: string,
  messageId: string,
  ctFingerprint: string,
  body: DecryptedBody,
): void {
  memory.set(cacheKey(userId, messageId), { ...body, ctFingerprint });
}

async function idbPut(
  userId: string,
  messageId: string,
  entry: CachedPayloadEntry,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry, cacheKey(userId, messageId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort */
  }
}

async function idbGet(userId: string, messageId: string): Promise<CachedPayloadEntry | null> {
  try {
    const db = await openDb();
    const result = await new Promise<CachedPayloadEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(cacheKey(userId, messageId));
      req.onsuccess = () => resolve(req.result as CachedPayloadEntry | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result ?? null;
  } catch {
    return null;
  }
}

export async function getPayloadCached(
  userId: string,
  messageId: string,
  ctFingerprint: string,
): Promise<DecryptedBody | null> {
  const mem = getPayloadFromMemory(userId, messageId, ctFingerprint);
  if (mem) return mem;

  const fromIdb = await idbGet(userId, messageId);
  if (!fromIdb || fromIdb.ctFingerprint !== ctFingerprint) return null;

  const { ctFingerprint: _fp, ...body } = fromIdb;
  setPayloadMemory(userId, messageId, ctFingerprint, body);
  return body;
}

export async function rememberPayload(
  userId: string,
  messageId: string,
  ctFingerprint: string,
  body: DecryptedBody,
): Promise<void> {
  if (body.text === '[Unable to decrypt]') return;
  const entry: CachedPayloadEntry = { ...body, ctFingerprint };
  setPayloadMemory(userId, messageId, ctFingerprint, body);
  await idbPut(userId, messageId, entry);
}

export function ensureDecryptedPayloadHydrated(userId: string): Promise<void> {
  if (hydratedUserId === userId) return Promise.resolve();
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const prefix = `${userId}:m:`;
    try {
      const db = await openDb();
      const keys: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const key = String(cursor.key);
          if (key.startsWith(prefix)) {
            memory.set(key, cursor.value as CachedPayloadEntry);
            keys.push(key);
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (keys.length > MAX_ENTRIES) {
        keys.sort();
        for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) {
          memory.delete(key);
        }
      }
      db.close();
    } catch {
      /* ignore */
    }
    hydratedUserId = userId;
    hydratePromise = null;
  })();

  return hydratePromise;
}

export async function clearDecryptedPayloadForUser(userId: string): Promise<void> {
  const prefix = `${userId}:m:`;
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  hydratedUserId = null;
  hydratePromise = null;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
