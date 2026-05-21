const STORAGE_KEY = 'chat-e2ee-sent-plain';
const META_STORAGE_KEY = 'chat-e2ee-sent-meta';
const MAX_ENTRIES = 500;

const byClientId = new Map<string, string>();
const byMessageId = new Map<string, string>();
const metaByClientId = new Map<string, Record<string, unknown>>();
const metaByMessageId = new Map<string, Record<string, unknown>>();

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

function hydrateFromStorage(userId: string): void {
  const data = loadPersisted();
  const prefix = `${userId}:`;
  for (const [key, text] of Object.entries(data)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest.startsWith('c:')) byClientId.set(rest.slice(2), text);
    else if (rest.startsWith('m:')) byMessageId.set(rest.slice(2), text);
  }
}

let hydratedUserId: string | null = null;

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
  hydrateFromStorage(userId);
  const metaData = loadPersistedMeta();
  const prefix = `${userId}:`;
  for (const [key, meta] of Object.entries(metaData)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest.startsWith('c:')) metaByClientId.set(rest.slice(2), meta);
    else if (rest.startsWith('m:')) metaByMessageId.set(rest.slice(2), meta);
  }
  hydratedUserId = userId;
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

  const data = loadPersisted();
  data[storageKey(userId, 'c', clientMessageId)] = plaintext;
  if (messageId) data[storageKey(userId, 'm', messageId)] = plaintext;
  savePersisted(data);
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
    const data = loadPersisted();
    data[storageKey(userId, 'm', messageId)] = text;
    data[storageKey(userId, 'c', clientMessageId)] = text;
    savePersisted(data);
  }

  const meta =
    metaByClientId.get(clientMessageId) ??
    loadPersistedMeta()[storageKey(userId, 'c', clientMessageId)];
  if (meta) {
    rememberSentPayloadMeta(userId, clientMessageId, meta, messageId);
  }
}
