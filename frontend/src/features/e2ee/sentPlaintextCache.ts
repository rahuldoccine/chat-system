import {
  idbClearSentEntriesForUser,
  idbGetSentEntry,
  idbLoadSentEntriesForUser,
  idbPutSentEntry,
  type SentPlaintextEntry,
} from './sentPlaintextIdb';

const STORAGE_KEY = 'chat-e2ee-sent-plain';
const META_STORAGE_KEY = 'chat-e2ee-sent-meta';
const MAX_ENTRIES = 500;

const byClientId = new Map<string, string>();
const byMessageId = new Map<string, string>();
const metaByClientId = new Map<string, Record<string, unknown>>();
const metaByMessageId = new Map<string, Record<string, unknown>>();

let hydratedUserId: string | null = null;
let idbHydratedUserId: string | null = null;
let idbHydratePromise: Promise<void> | null = null;

function loadPersisted(): Record<string, string> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePersisted(data: Record<string, string>): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys = Object.keys(data);
  if (keys.length > MAX_ENTRIES) {
    const trimmed: Record<string, string> = {};
    for (const k of keys.slice(-MAX_ENTRIES)) {
      trimmed[k] = data[k]!;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function storageKey(userId: string, kind: 'c' | 'm', id: string): string {
  return `${userId}:${kind}:${id}`;
}

function mergeEntryIntoMemory(key: string, entry: SentPlaintextEntry): void {
  const parts = key.split(':');
  if (parts.length < 3) return;
  const kind = parts[1];
  const id = parts.slice(2).join(':');
  if (kind === 'c') {
    byClientId.set(id, entry.text);
    if (entry.meta) metaByClientId.set(id, entry.meta);
  } else if (kind === 'm') {
    byMessageId.set(id, entry.text);
    if (entry.meta) metaByMessageId.set(id, entry.meta);
  }
}

function hydrateFromSessionStorage(userId: string): void {
  const data = loadPersisted();
  const prefix = `${userId}:`;
  for (const [key, text] of Object.entries(data)) {
    if (!key.startsWith(prefix)) continue;
    mergeEntryIntoMemory(key, { text });
  }
  const metaData = loadPersistedMeta();
  for (const [key, meta] of Object.entries(metaData)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest.startsWith('c:')) metaByClientId.set(rest.slice(2), meta);
    else if (rest.startsWith('m:')) metaByMessageId.set(rest.slice(2), meta);
  }
}

function loadPersistedMeta(): Record<string, Record<string, unknown>> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(META_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePersistedMeta(data: Record<string, Record<string, unknown>>): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys = Object.keys(data);
  if (keys.length > MAX_ENTRIES) {
    const trimmed: Record<string, Record<string, unknown>> = {};
    for (const k of keys.slice(-MAX_ENTRIES)) {
      trimmed[k] = data[k]!;
    }
    sessionStorage.setItem(META_STORAGE_KEY, JSON.stringify(trimmed));
    return;
  }
  sessionStorage.setItem(META_STORAGE_KEY, JSON.stringify(data));
}

function ensureHydrated(userId: string): void {
  if (hydratedUserId === userId) return;
  byClientId.clear();
  byMessageId.clear();
  metaByClientId.clear();
  metaByMessageId.clear();
  hydrateFromSessionStorage(userId);
  hydratedUserId = userId;
}

async function hydrateFromIndexedDb(userId: string): Promise<void> {
  if (idbHydratedUserId === userId) return;
  ensureHydrated(userId);

  const entries = await idbLoadSentEntriesForUser(userId);
  for (const [key, entry] of Object.entries(entries)) {
    mergeEntryIntoMemory(key, entry);
  }

  // One-time migration: copy sessionStorage entries into IndexedDB when missing there.
  const plainData = loadPersisted();
  const metaData = loadPersistedMeta();
  const prefix = `${userId}:`;
  for (const [key, text] of Object.entries(plainData)) {
    if (!key.startsWith(prefix)) continue;
    if (!entries[key]) {
      const meta = metaData[key];
      const entry: SentPlaintextEntry = { text, ...(meta ? { meta } : {}) };
      await idbPutSentEntry(key, entry);
      mergeEntryIntoMemory(key, entry);
    }
  }

  idbHydratedUserId = userId;
}

/** Load sent plaintext from IndexedDB (required before showing history after relogin). */
export function ensureSentPlaintextHydrated(userId: string): Promise<void> {
  if (idbHydratedUserId !== userId) {
    idbHydratedUserId = null;
  }
  if (idbHydratedUserId === userId) return Promise.resolve();
  if (!idbHydratePromise) {
    idbHydratePromise = hydrateFromIndexedDb(userId).finally(() => {
      idbHydratePromise = null;
    });
  }
  return idbHydratePromise;
}

function persistEntry(
  userId: string,
  kind: 'c' | 'm',
  id: string,
  text: string,
  meta?: Record<string, unknown>,
): void {
  const key = storageKey(userId, kind, id);
  const data = loadPersisted();
  data[key] = text;
  savePersisted(data);

  if (meta && Object.keys(meta).length) {
    const metaData = loadPersistedMeta();
    metaData[key] = meta;
    savePersistedMeta(metaData);
  }

  void idbPutSentEntry(key, {
    text,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  });
}

export function rememberSentPlaintext(
  userId: string,
  clientMessageId: string,
  plaintext: string,
  messageId?: string,
): void {
  ensureHydrated(userId);
  byClientId.set(clientMessageId, plaintext);
  if (messageId) byMessageId.set(messageId, plaintext);

  persistEntry(userId, 'c', clientMessageId, plaintext);
  if (messageId) persistEntry(userId, 'm', messageId, plaintext);
}

export async function getSentPlaintextAsync(
  userId: string,
  msg: { id: string; clientMessageId?: string },
): Promise<string | undefined> {
  await ensureSentPlaintextHydrated(userId);
  const hit = getSentPlaintext(userId, msg);
  if (hit !== undefined) return hit;

  if (msg.clientMessageId) {
    const key = storageKey(userId, 'c', msg.clientMessageId);
    const entry = await idbGetSentEntry(key);
    if (entry?.text) {
      byClientId.set(msg.clientMessageId, entry.text);
      if (entry.meta) metaByClientId.set(msg.clientMessageId, entry.meta);
      return entry.text;
    }
  }
  const keyM = storageKey(userId, 'm', msg.id);
  const entryM = await idbGetSentEntry(keyM);
  if (entryM?.text) {
    byMessageId.set(msg.id, entryM.text);
    if (entryM.meta) metaByMessageId.set(msg.id, entryM.meta);
    return entryM.text;
  }
  return undefined;
}

export function getSentPlaintext(
  userId: string,
  msg: {
    id: string;
    clientMessageId?: string;
  },
): string | undefined {
  ensureHydrated(userId);
  const data = loadPersisted();

  if (msg.clientMessageId) {
    const hit = byClientId.get(msg.clientMessageId);
    if (hit) return hit;
    const persisted = data[storageKey(userId, 'c', msg.clientMessageId)];
    if (persisted) return persisted;
  }

  const mem = byMessageId.get(msg.id);
  if (mem) return mem;
  return data[storageKey(userId, 'm', msg.id)];
}

export function rememberSentPayloadMeta(
  userId: string,
  clientMessageId: string,
  meta: Record<string, unknown>,
  messageId?: string,
): void {
  if (!meta || !Object.keys(meta).length) return;
  ensureHydrated(userId);
  metaByClientId.set(clientMessageId, meta);
  if (messageId) metaByMessageId.set(messageId, meta);

  const data = loadPersistedMeta();
  data[storageKey(userId, 'c', clientMessageId)] = meta;
  if (messageId) data[storageKey(userId, 'm', messageId)] = meta;
  savePersistedMeta(data);

  const text =
    byClientId.get(clientMessageId) ??
    loadPersisted()[storageKey(userId, 'c', clientMessageId)] ??
    (messageId ? byMessageId.get(messageId) : undefined);
  if (text !== undefined) {
    void idbPutSentEntry(storageKey(userId, 'c', clientMessageId), { text, meta });
    if (messageId) void idbPutSentEntry(storageKey(userId, 'm', messageId), { text, meta });
  }
}

export function getSentPayloadMeta(
  userId: string,
  msg: { id: string; clientMessageId?: string },
): Record<string, unknown> | undefined {
  ensureHydrated(userId);
  const data = loadPersistedMeta();

  if (msg.clientMessageId) {
    const hit = metaByClientId.get(msg.clientMessageId);
    if (hit) return hit;
    const persisted = data[storageKey(userId, 'c', msg.clientMessageId)];
    if (persisted) return persisted;
  }

  const mem = metaByMessageId.get(msg.id);
  if (mem) return mem;
  return data[storageKey(userId, 'm', msg.id)];
}

export function linkSentMessageId(
  userId: string,
  clientMessageId: string,
  messageId: string,
): void {
  const text =
    byClientId.get(clientMessageId) ?? loadPersisted()[storageKey(userId, 'c', clientMessageId)];
  if (text) {
    byMessageId.set(messageId, text);
    persistEntry(userId, 'm', messageId, text);
    persistEntry(userId, 'c', clientMessageId, text);
  }

  const meta =
    metaByClientId.get(clientMessageId) ??
    loadPersistedMeta()[storageKey(userId, 'c', clientMessageId)];
  if (meta) {
    rememberSentPayloadMeta(userId, clientMessageId, meta, messageId);
  }
}

/** Remove all sent-plaintext cache for a user (logout all devices). */
export async function clearSentPlaintextForUser(userId: string): Promise<void> {
  byClientId.clear();
  byMessageId.clear();
  metaByClientId.clear();
  metaByMessageId.clear();
  hydratedUserId = null;
  idbHydratedUserId = null;

  if (typeof sessionStorage !== 'undefined') {
    const prefix = `${userId}:`;
    const plain = loadPersisted();
    const meta = loadPersistedMeta();
    for (const key of Object.keys(plain)) {
      if (key.startsWith(prefix)) delete plain[key];
    }
    for (const key of Object.keys(meta)) {
      if (key.startsWith(prefix)) delete meta[key];
    }
    savePersisted(plain);
    savePersistedMeta(meta);
  }

  await idbClearSentEntriesForUser(userId);
}
