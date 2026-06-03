/** Shared IndexedDB open + transaction helpers for E2EE stores. */

export function openE2eeStore(
  dbName: string,
  storeName: string,
  version = 1,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
  });
}

export async function idbPutValue(
  dbName: string,
  storeName: string,
  key: IDBValidKey,
  value: unknown,
): Promise<void> {
  const db = await openE2eeStore(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function idbGetValue<T>(
  dbName: string,
  storeName: string,
  key: IDBValidKey,
): Promise<T | null> {
  const db = await openE2eeStore(dbName, storeName);
  try {
    const result = await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
    return result ?? null;
  } finally {
    db.close();
  }
}

export async function idbCollectCursorValues<T>(
  dbName: string,
  storeName: string,
  shouldInclude?: (key: IDBValidKey, value: T) => boolean,
): Promise<T[]> {
  const out: T[] = [];
  const db = await openE2eeStore(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const value = cursor.value as T;
        if (!shouldInclude || shouldInclude(cursor.key, value)) {
          out.push(value);
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return out;
}

export async function idbForEachEntry<T>(
  dbName: string,
  storeName: string,
  visit: (key: IDBValidKey, value: T) => void,
): Promise<void> {
  const db = await openE2eeStore(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        visit(cursor.key, cursor.value as T);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function idbDeleteKeys(
  dbName: string,
  storeName: string,
  keys: IDBValidKey[],
): Promise<void> {
  if (keys.length === 0) return;
  const db = await openE2eeStore(dbName, storeName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const key of keys) store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
