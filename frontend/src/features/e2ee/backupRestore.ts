import type { RestoredBackupPayload } from './backupPayload';
import { hydrateGroupSenderKeysFromIdb, rememberSenderKey } from './groupSenderKeys';
import { idbImportGroupSenderKeys } from './groupSenderKeysIdb';
import { importSentPlaintextEntries } from './sentPlaintextCache';

export async function restoreAuxiliaryBackupData(
  restored: RestoredBackupPayload,
): Promise<void> {
  await importSentPlaintextEntries(restored.material.userId, restored.sentPlaintext);
  await idbImportGroupSenderKeys(restored.groupSenderKeys);
  for (const row of restored.groupSenderKeys) {
    const raw = Uint8Array.from(atob(row.keyB64), (c) => c.codePointAt(0) ?? 0);
    rememberSenderKey(row.chatId, row.senderId, row.epoch, raw);
  }
  await hydrateGroupSenderKeysFromIdb();
}
