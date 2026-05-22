import { loadKeyMaterial, saveKeyMaterial, type E2eeKeyMaterial } from './keyStore';
import { restoreSessionUnlock } from './sessionUnlock';

/** Load private keys from IndexedDB or tab-session cache (survives refresh). */
export async function getLocalKeyMaterial(userId: string): Promise<E2eeKeyMaterial | null> {
  let material = await loadKeyMaterial(userId);
  if (!material) {
    material = await restoreSessionUnlock(userId);
    if (material) {
      await saveKeyMaterial(material);
    }
  }
  return material;
}
