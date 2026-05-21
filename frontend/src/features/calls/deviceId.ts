const STORAGE_KEY = 'chat_call_device_id';

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Stable per-browser device id for call signaling. */
export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return randomId();
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
