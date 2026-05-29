import { getOrCreateDeviceId } from '../calls/deviceId';
import type { E2eeKeyMaterial } from './keyStore';
import { exportGroupSenderKeysForBackup } from './groupSenderKeys';
import { idbLoadSentEntriesForUser, type SentPlaintextEntry } from './sentPlaintextIdb';
import type { GroupSenderKeyIdbRow } from './groupSenderKeysIdb';

export const BACKUP_PAYLOAD_VERSION = 2;

export type E2eeBackupPayloadV2 = {
  version: typeof BACKUP_PAYLOAD_VERSION;
  keyMaterial: E2eeKeyMaterial;
  deviceId: string;
  sentPlaintext: Record<string, SentPlaintextEntry>;
  groupSenderKeys: GroupSenderKeyIdbRow[];
};

function isKeyMaterialShape(value: unknown): value is E2eeKeyMaterial {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.identityPrivateJwk === 'object' &&
    typeof v.identityPublicSpki === 'string' &&
    Array.isArray(v.signedPreKeys)
  );
}

export async function buildBackupPayloadJson(
  material: E2eeKeyMaterial,
): Promise<string> {
  const sentPlaintext = await idbLoadSentEntriesForUser(material.userId);
  const groupSenderKeys = exportGroupSenderKeysForBackup();
  const payload: E2eeBackupPayloadV2 = {
    version: BACKUP_PAYLOAD_VERSION,
    keyMaterial: material,
    deviceId: getOrCreateDeviceId(),
    sentPlaintext,
    groupSenderKeys,
  };
  return JSON.stringify(payload);
}

export type RestoredBackupPayload = {
  material: E2eeKeyMaterial;
  sentPlaintext: Record<string, SentPlaintextEntry>;
  groupSenderKeys: GroupSenderKeyIdbRow[];
};

/** Parse wrapped backup JSON — supports v2 payload and legacy key-material-only JSON. */
export function parseBackupPayloadJson(userId: string, json: string): RestoredBackupPayload {
  const parsed = JSON.parse(json) as Record<string, unknown>;

  if (parsed.version === BACKUP_PAYLOAD_VERSION && isKeyMaterialShape(parsed.keyMaterial)) {
    const material = parsed.keyMaterial as E2eeKeyMaterial;
    material.userId = userId;
    return {
      material,
      sentPlaintext:
        parsed.sentPlaintext && typeof parsed.sentPlaintext === 'object'
          ? (parsed.sentPlaintext as Record<string, SentPlaintextEntry>)
          : {},
      groupSenderKeys: Array.isArray(parsed.groupSenderKeys)
        ? (parsed.groupSenderKeys as GroupSenderKeyIdbRow[])
        : [],
    };
  }

  if (isKeyMaterialShape(parsed)) {
    const material = parsed as E2eeKeyMaterial;
    material.userId = userId;
    return { material, sentPlaintext: {}, groupSenderKeys: [] };
  }

  throw new Error('Unsupported key backup format');
}
