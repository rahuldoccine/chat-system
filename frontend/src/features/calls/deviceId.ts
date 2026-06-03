const STORAGE_KEY = 'chat_call_device_id';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Secure random unavailable for call device id');
}

/** Stable per-browser device id for call signaling (not a secret; must be unique). */
export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return randomId();
  let id = localStorage.getItem(STORAGE_KEY);
  const wasMissing = id == null;
  id ??= randomId();
  if (wasMissing) {
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
