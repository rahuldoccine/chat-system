/**
 * Durable store for group sender keys (survives browser restart).
 */

import {
  idbCollectCursorValues,
  idbPutValue,
} from './e2eeIdb';

const DB_NAME = 'chat-e2ee-group-keys-v1';
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

export async function idbPutGroupSenderKey(row: GroupSenderKeyIdbRow): Promise<void> {
  try {
    await idbPutValue(DB_NAME, STORE, rowKey(row.chatId, row.senderId, row.epoch), row);
  } catch {
    /* best-effort */
  }
}

export async function idbLoadGroupSenderKeys(): Promise<GroupSenderKeyIdbRow[]> {
  try {
    return await idbCollectCursorValues<GroupSenderKeyIdbRow>(DB_NAME, STORE);
  } catch {
    return [];
  }
}

export async function idbImportGroupSenderKeys(rows: GroupSenderKeyIdbRow[]): Promise<void> {
  for (const row of rows) {
    await idbPutGroupSenderKey(row);
  }
}

export async function idbExportGroupSenderKeys(): Promise<GroupSenderKeyIdbRow[]> {
  return idbLoadGroupSenderKeys();
}
