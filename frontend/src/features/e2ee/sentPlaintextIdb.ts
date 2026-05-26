/**
 * Durable store for outbound E2EE plaintext (sender cannot decrypt own ciphertext).
 * Survives logout/relogin on the same browser; cleared on logout-all.
 */

const DB_NAME = 'chat-e2ee-sent-v1';
const DB_VERSION = 1;
const STORE = 'entries';

export type SentPlaintextEntry = {
  text: string;
  meta?: Record<string, unknown>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function idbPutSentEntry(key: string, entry: SentPlaintextEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort */
  }
}

export async function idbGetSentEntry(key: string): Promise<SentPlaintextEntry | null> {
  try {
    const db = await openDb();
    const result = await new Promise<SentPlaintextEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as SentPlaintextEntry | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result ?? null;
  } catch {
    return null;
  }
}

export async function idbLoadSentEntriesForUser(
  userId: string,
): Promise<Record<string, SentPlaintextEntry>> {
  const prefix = `${userId}:`;
  const out: Record<string, SentPlaintextEntry> = {};
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (key.startsWith(prefix)) {
          out[key] = cursor.value as SentPlaintextEntry;
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
  return out;
}

export async function idbClearSentEntriesForUser(userId: string): Promise<void> {
  const prefix = `${userId}:`;
  try {
    const db = await openDb();
    const keysToDelete: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (key.startsWith(prefix)) keysToDelete.push(key);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (keysToDelete.length) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const key of keysToDelete) store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
  } catch {
    /* ignore */
  }
}
