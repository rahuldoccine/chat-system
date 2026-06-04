import { uploadKeyMaterialToServer } from './accountSync';
import { getLocalKeyMaterial } from './keyAccess';

let loginPassword: { userId: string; password: string } | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** In-memory only — used to refresh server escrow backup (includes sent-plaintext cache). */
export function rememberLoginPasswordForBackup(userId: string, password: string): void {
  loginPassword = { userId, password };
}

export function clearLoginPasswordForBackup(): void {
  loginPassword = null;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

/** Debounced upload after sends so another device can restore sent message text. */
export function scheduleE2eeBackupSync(userId: string): void {
  if (!loginPassword || loginPassword.userId !== userId) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void flushE2eeBackupSync(userId);
  }, 2500);
}

export async function flushE2eeBackupSync(userId: string): Promise<void> {
  const creds = loginPassword;
  if (!creds || creds.userId !== userId) return;
  const material = await getLocalKeyMaterial(userId);
  if (!material) return;
  try {
    await uploadKeyMaterialToServer(material, creds.password, userId);
  } catch {
    /* best-effort — user can sign in again to force upload */
  }
}
