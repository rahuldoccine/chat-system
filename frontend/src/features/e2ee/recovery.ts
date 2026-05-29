import { wrapKeyBackup, unwrapKeyBackup } from './crypto';
import { ACCOUNT_BACKUP_WRAP_ALG, unwrapKeyMaterialFromAccount } from './accountEscrow';
import { buildBackupPayloadJson, parseBackupPayloadJson } from './backupPayload';
import { restoreAuxiliaryBackupData } from './backupRestore';
import { loadKeyMaterial, saveKeyMaterial } from './keyStore';
import * as e2eeApi from './e2eeApi';

export async function createAndUploadBackup(
  userId: string,
  passphrase: string,
): Promise<void> {
  const material = await loadKeyMaterial(userId);
  if (!material) throw new Error('No local encryption keys');
  const json = await buildBackupPayloadJson(material);
  const { wrapAlg, wrapped } = await wrapKeyBackup(passphrase, json);
  await e2eeApi.putKeyBackup(wrapAlg, wrapped);
}

export async function restoreFromBackup(
  userId: string,
  passphrase: string,
  stepUpToken: string,
): Promise<void> {
  const backup = await e2eeApi.getKeyBackup(stepUpToken);
  if (backup.wrapAlg === ACCOUNT_BACKUP_WRAP_ALG) {
    await unwrapKeyMaterialFromAccount(
      backup.wrappedPrivateKeyMaterial,
      backup.wrapAlg,
      passphrase,
      userId,
    );
    return;
  }
  const json = await unwrapKeyBackup(passphrase, backup.wrappedPrivateKeyMaterial);
  const restored = parseBackupPayloadJson(userId, json);
  await saveKeyMaterial(restored.material);
  await restoreAuxiliaryBackupData(restored);
}

export async function requestRecoveryCode(): Promise<void> {
  await e2eeApi.postRecoveryEmailChallenge();
}

export async function verifyRecoveryCode(code: string): Promise<string> {
  const { stepUpToken } = await e2eeApi.postRecoveryEmailVerify(code);
  return stepUpToken;
}

export { getServerAccountKeyStatus, type AccountKeyStatus } from './accountSync';
