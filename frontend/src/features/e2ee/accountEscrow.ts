import { wrapKeyBackup, unwrapKeyBackup } from './crypto';
import {
  exportKeyMaterialJson,
  importKeyMaterialJson,
  type E2eeKeyMaterial,
} from './keyStore';

export const ACCOUNT_BACKUP_WRAP_ALG = 'account-login-pbkdf2-v1';

/** Derive escrow secret from login password + user id (never sent to server). */
export function accountEscrowSecret(password: string, userId: string): string {
  return `${password}\u0000${userId}`;
}

export async function wrapKeyMaterialForAccount(
  material: E2eeKeyMaterial,
  password: string,
  userId: string,
): Promise<{ wrapAlg: string; wrappedPrivateKeyMaterial: string }> {
  const json = await exportKeyMaterialJson(material);
  const { wrapped } = await wrapKeyBackup(accountEscrowSecret(password, userId), json);
  return { wrapAlg: ACCOUNT_BACKUP_WRAP_ALG, wrappedPrivateKeyMaterial: wrapped };
}

export async function unwrapKeyMaterialFromAccount(
  wrappedPrivateKeyMaterial: string,
  wrapAlg: string,
  password: string,
  userId: string,
): Promise<E2eeKeyMaterial> {
  if (wrapAlg !== ACCOUNT_BACKUP_WRAP_ALG && wrapAlg !== 'pbkdf2-aes-gcm-v1') {
    throw new Error('Unsupported key backup format');
  }
  const secret =
    wrapAlg === ACCOUNT_BACKUP_WRAP_ALG
      ? accountEscrowSecret(password, userId)
      : password;
  const json = await unwrapKeyBackup(secret, wrappedPrivateKeyMaterial);
  return importKeyMaterialJson(userId, json);
}
