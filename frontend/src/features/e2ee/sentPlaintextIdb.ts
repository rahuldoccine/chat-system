/**
 * Durable store for outbound E2EE plaintext (sender cannot decrypt own ciphertext).
 * Survives logout/relogin on the same browser; cleared on logout-all.
 */

import { idbKeyToString } from '../../utils/plainObject';
import {
  idbDeleteKeys,
  idbForEachEntry,
  idbGetValue,
  idbPutValue,
} from './e2eeIdb';

const DB_NAME = 'chat-e2ee-sent-v1';
const STORE = 'entries';

export type SentPlaintextEntry = {
  text: string;
  meta?: Record<string, unknown>;
};

export async function idbPutSentEntry(key: string, entry: SentPlaintextEntry): Promise<void> {
  try {
    await idbPutValue(DB_NAME, STORE, key, entry);
  } catch {
    /* best-effort */
  }
}

export async function idbGetSentEntry(key: string): Promise<SentPlaintextEntry | null> {
  try {
    return await idbGetValue<SentPlaintextEntry>(DB_NAME, STORE, key);
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
    await idbForEachEntry<SentPlaintextEntry>(DB_NAME, STORE, (key, value) => {
      const keyStr = idbKeyToString(key);
      if (keyStr.startsWith(prefix)) {
        out[keyStr] = value;
      }
    });
  } catch {
    /* ignore */
  }
  return out;
}

export async function idbClearSentEntriesForUser(userId: string): Promise<void> {
  const prefix = `${userId}:`;
  try {
    const keysToDelete: string[] = [];
    await idbForEachEntry<SentPlaintextEntry>(DB_NAME, STORE, (key) => {
      const keyStr = idbKeyToString(key);
      if (keyStr.startsWith(prefix)) keysToDelete.push(keyStr);
    });
    await idbDeleteKeys(DB_NAME, STORE, keysToDelete);
  } catch {
    /* ignore */
  }
}
