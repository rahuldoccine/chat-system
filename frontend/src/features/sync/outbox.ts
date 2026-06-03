const DB_NAME = 'chat-module-sync';
const STORE = 'pending_messages';
const DB_VERSION = 1;

export type OutboxStatus = 'pending' | 'sending' | 'failed';

export type OutboxPayload = {
  clientMessageId: string;
  chatId: string;
  ciphertext: string;
  kind: 'TEXT' | 'IMAGE' | 'FILE' | 'OTHER';
  replyToId?: string | null;
  threadRootId?: string | null;
  broadcastToChannel?: boolean;
  contentMeta?: unknown;
};

export type OutboxEntry = OutboxPayload & {
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Could not open outbox'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientMessageId' });
        store.createIndex('chatId', 'chatId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const result = fn(store);
        transaction.oncomplete = () => {
          db.close();
          if (result instanceof IDBRequest) {
            resolve(result.result);
          } else {
            resolve();
          }
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error('Outbox transaction failed'));
        };
      }),
  );
}

export async function enqueueOutbox(entry: OutboxPayload): Promise<void> {
  const row: OutboxEntry = {
    ...entry,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pending',
  };
  await tx('readwrite', (store) => store.put(row));
}

export async function listPendingOutbox(): Promise<OutboxEntry[]> {
  const all = (await tx<OutboxEntry[]>('readonly', (store) => store.getAll())) ?? [];
  return all
    .filter((e) => e.status === 'pending' || e.status === 'failed')
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOutbox(clientMessageId: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(clientMessageId));
}

export async function markOutboxSending(clientMessageId: string): Promise<void> {
  const row = (await tx<OutboxEntry>('readonly', (store) =>
    store.get(clientMessageId),
  )) as OutboxEntry | undefined;
  if (!row) return;
  await tx('readwrite', (store) =>
    store.put({ ...row, status: 'sending' as const, attempts: row.attempts + 1 }),
  );
}

export async function markOutboxFailed(clientMessageId: string): Promise<void> {
  const row = (await tx<OutboxEntry>('readonly', (store) =>
    store.get(clientMessageId),
  )) as OutboxEntry | undefined;
  if (!row) return;
  await tx('readwrite', (store) => store.put({ ...row, status: 'failed' as const }));
}

export async function resetOutboxPending(clientMessageId: string): Promise<void> {
  const row = (await tx<OutboxEntry>('readonly', (store) =>
    store.get(clientMessageId),
  )) as OutboxEntry | undefined;
  if (!row) return;
  await tx('readwrite', (store) => store.put({ ...row, status: 'pending' as const }));
}
