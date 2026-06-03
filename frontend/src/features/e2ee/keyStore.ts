import {
  exportPrivateKeyJwk,
  exportPublicKeySpki,
  generateEcdhKeyPair,
  generateEcdsaKeyPair,
  importEcdhPrivateKey,
  importEcdsaPrivateKey,
} from './crypto';
import { idbGetValue, idbPutValue } from './e2eeIdb';

const DB_NAME = 'chat-e2ee-v1';
const STORE = 'keys';

export type SignedPreKeyRecord = {
  keyId: string;
  privateJwk: JsonWebKey;
  publicSpki: string;
};

export type OneTimePreKeyRecord = {
  keyId: string;
  privateJwk: JsonWebKey;
  publicSpki: string;
};

export type E2eeKeyMaterial = {
  userId: string;
  identityPrivateJwk: JsonWebKey;
  identityPublicSpki: string;
  devicePrivateJwk: JsonWebKey;
  devicePublicSpki: string;
  signingPrivateJwk: JsonWebKey;
  signedPreKeys: SignedPreKeyRecord[];
  oneTimePreKeys: OneTimePreKeyRecord[];
};

export async function loadKeyMaterial(userId: string): Promise<E2eeKeyMaterial | null> {
  return idbGetValue<E2eeKeyMaterial>(DB_NAME, STORE, userId);
}

export async function saveKeyMaterial(material: E2eeKeyMaterial): Promise<void> {
  await idbPutValue(DB_NAME, STORE, material.userId, material);
}

export async function createKeyMaterial(userId: string): Promise<E2eeKeyMaterial> {
  const identity = await generateEcdhKeyPair();
  const device = await generateEcdhKeyPair();
  const signing = await generateEcdsaKeyPair();
  const spk = await generateEcdhKeyPair();
  const spkId = `spk-${Date.now()}`;
  const material: E2eeKeyMaterial = {
    userId,
    identityPrivateJwk: await exportPrivateKeyJwk(identity.privateKey),
    identityPublicSpki: await exportPublicKeySpki(identity.publicKey),
    devicePrivateJwk: await exportPrivateKeyJwk(device.privateKey),
    devicePublicSpki: await exportPublicKeySpki(device.publicKey),
    signingPrivateJwk: await exportPrivateKeyJwk(signing.privateKey),
    signedPreKeys: [
      {
        keyId: spkId,
        privateJwk: await exportPrivateKeyJwk(spk.privateKey),
        publicSpki: await exportPublicKeySpki(spk.publicKey),
      },
    ],
    oneTimePreKeys: [],
  };
  await saveKeyMaterial(material);
  return material;
}

export async function addOneTimePreKeys(
  material: E2eeKeyMaterial,
  count: number,
): Promise<OneTimePreKeyRecord[]> {
  const created: OneTimePreKeyRecord[] = [];
  for (let i = 0; i < count; i++) {
    const pair = await generateEcdhKeyPair();
    created.push({
      keyId: `otpk-${Date.now()}-${i}`,
      privateJwk: await exportPrivateKeyJwk(pair.privateKey),
      publicSpki: await exportPublicKeySpki(pair.publicKey),
    });
  }
  material.oneTimePreKeys = [...material.oneTimePreKeys, ...created];
  await saveKeyMaterial(material);
  return created;
}

export async function getSignedPreKeyPrivate(
  material: E2eeKeyMaterial,
  keyId: string,
): Promise<CryptoKey | null> {
  const row = material.signedPreKeys.find((k) => k.keyId === keyId);
  if (!row) return null;
  return importEcdhPrivateKey(row.privateJwk);
}

export async function getLatestSignedPreKeyPrivate(
  material: E2eeKeyMaterial,
): Promise<{ key: CryptoKey; keyId: string } | null> {
  const row = material.signedPreKeys.at(-1);
  if (!row) return null;
  return { key: await importEcdhPrivateKey(row.privateJwk), keyId: row.keyId };
}

export async function getIdentityPrivate(material: E2eeKeyMaterial): Promise<CryptoKey> {
  return importEcdhPrivateKey(material.identityPrivateJwk);
}

export async function getSigningPrivate(material: E2eeKeyMaterial): Promise<CryptoKey> {
  return importEcdsaPrivateKey(material.signingPrivateJwk);
}

export async function exportKeyMaterialJson(material: E2eeKeyMaterial): Promise<string> {
  return JSON.stringify(material);
}

export async function importKeyMaterialJson(userId: string, json: string): Promise<E2eeKeyMaterial> {
  const parsed = JSON.parse(json) as E2eeKeyMaterial;
  parsed.userId = userId;
  await saveKeyMaterial(parsed);
  return parsed;
}
