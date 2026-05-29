/**
 * Durable store for group sender keys (survives browser restart).
 */

const DB_NAME = 'chat-e2ee-group-keys-v1';
const DB_VERSION = 1;
const STORE = 'keys';

export type GroupSenderKeyIdbRow = {
  chatId: string;
  senderId: string;
  epoch: number;
  keyB64: string;
};

function rowKey(chatId: string, senderId: string, epoch: number): string {
  return `${chatId}:${senderId}:${epoch}`;
}

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

export async function idbPutGroupSenderKey(row: GroupSenderKeyIdbRow): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(row, rowKey(row.chatId, row.senderId, row.epoch));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort */
  }
}

export async function idbLoadGroupSenderKeys(): Promise<GroupSenderKeyIdbRow[]> {
  const out: GroupSenderKeyIdbRow[] = [];
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        out.push(cursor.value as GroupSenderKeyIdbRow);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort */
  }
  return out;
}

export async function idbImportGroupSenderKeys(rows: GroupSenderKeyIdbRow[]): Promise<void> {
  for (const row of rows) {
    await idbPutGroupSenderKey(row);
  }
}

export async function idbExportGroupSenderKeys(): Promise<GroupSenderKeyIdbRow[]> {
  return idbLoadGroupSenderKeys();
}
