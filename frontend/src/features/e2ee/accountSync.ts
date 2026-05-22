import * as e2eeApi from './e2eeApi';
import { wrapKeyMaterialForAccount, unwrapKeyMaterialFromAccount } from './accountEscrow';
import {
  createKeyMaterial,
  loadKeyMaterial,
  saveKeyMaterial,
  type E2eeKeyMaterial,
} from './keyStore';
import { clearSessionUnlock, persistSessionUnlock, restoreSessionUnlock } from './sessionUnlock';

export class E2eeKeysLockedError extends Error {
  constructor(
    message = 'Encrypted messages need your account password. Sign out and sign in again to unlock.',
  ) {
    super(message);
    this.name = 'E2eeKeysLockedError';
  }
}

export async function serverHasKeyBackup(): Promise<boolean> {
  try {
    const status = await e2eeApi.getAccountKeyBackupStatus();
    return status.hasBackup;
  } catch {
    return false;
  }
}

export async function restoreKeyMaterialFromServer(
  userId: string,
  password: string,
): Promise<E2eeKeyMaterial | null> {
  try {
    const backup = await e2eeApi.getAccountKeyBackup();
    return await unwrapKeyMaterialFromAccount(
      backup.wrappedPrivateKeyMaterial,
      backup.wrapAlg,
      password,
      userId,
    );
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function uploadKeyMaterialToServer(
  material: E2eeKeyMaterial,
  password: string,
  userId: string,
): Promise<void> {
  const payload = await wrapKeyMaterialForAccount(material, password, userId);
  await e2eeApi.putKeyBackup(payload.wrapAlg, payload.wrappedPrivateKeyMaterial);
}

/**
 * Resolve local keys: IndexedDB → server escrow (password) → new keys only if no backup exists.
 */
export async function resolveKeyMaterial(
  userId: string,
  password?: string,
): Promise<E2eeKeyMaterial> {
  let material = await loadKeyMaterial(userId);

  if (!material) {
    material = await restoreSessionUnlock(userId);
  }

  if (!material && password) {
    material = await restoreKeyMaterialFromServer(userId, password);
    if (material) {
      await saveKeyMaterial(material);
    }
  }

  if (!material) {
    const hasBackup = await serverHasKeyBackup();
    if (hasBackup) {
      throw new E2eeKeysLockedError();
    }
    material = await createKeyMaterial(userId);
  }

  await persistSessionUnlock(userId, material);

  if (password) {
    await uploadKeyMaterialToServer(material, password, userId);
  }

  return material;
}

/** Re-wrap server key backup after the user changes their sign-in password. */
export async function rewrapAccountKeyBackup(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  let material = await loadKeyMaterial(userId);

  if (!material) {
    material = await restoreSessionUnlock(userId);
  }

  if (!material) {
    material = await restoreKeyMaterialFromServer(userId, currentPassword);
    if (material) {
      await saveKeyMaterial(material);
    }
  }

  if (!material) {
    throw new Error(
      'Could not unlock encryption keys with your current password. Sign in again or use account recovery.',
    );
  }

  await uploadKeyMaterialToServer(material, newPassword, userId);
  await persistSessionUnlock(userId, material);
}

export { clearSessionUnlock };
