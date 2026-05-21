import { getOrCreateDeviceId } from '../calls/deviceId';
import { signBytes } from './crypto';
import { fingerprintPublicKeySpki } from './encoding';
import {
  addOneTimePreKeys,
  createKeyMaterial,
  getSigningPrivate,
  loadKeyMaterial,
  type E2eeKeyMaterial,
} from './keyStore';
import * as e2eeApi from './e2eeApi';

const MIN_ONE_TIME_PREKEYS = 10;
const BOOTSTRAP_LABEL = 'Web browser';

let bootstrapPromise: Promise<void> | null = null;

async function publishKeys(material: E2eeKeyMaterial, deviceId: string): Promise<void> {
  const fingerprint = await fingerprintPublicKeySpki(material.identityPublicSpki);
  await e2eeApi.putIdentityKey(material.identityPublicSpki, fingerprint);
  await e2eeApi.putDeviceKey(deviceId, material.devicePublicSpki, BOOTSTRAP_LABEL);

  const latestSpk = material.signedPreKeys[material.signedPreKeys.length - 1]!;
  const signingKey = await getSigningPrivate(material);
  const signature = await signBytes(
    signingKey,
    new TextEncoder().encode(latestSpk.publicSpki),
  );

  let oneTime = material.oneTimePreKeys;
  if (oneTime.length < MIN_ONE_TIME_PREKEYS) {
    oneTime = await addOneTimePreKeys(material, MIN_ONE_TIME_PREKEYS - oneTime.length);
  }

  await e2eeApi.postPreKeys(deviceId, {
    signedPreKey: {
      keyId: latestSpk.keyId,
      publicKey: latestSpk.publicSpki,
      signature,
    },
    oneTimePreKeys: oneTime.map((k) => ({ keyId: k.keyId, publicKey: k.publicSpki })),
  });
}

export async function ensureE2eeReady(userId: string): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const deviceId = getOrCreateDeviceId();
    let material = await loadKeyMaterial(userId);
    if (!material) {
      material = await createKeyMaterial(userId);
    }
    await publishKeys(material, deviceId);
  })().finally(() => {
    bootstrapPromise = null;
  });
  return bootstrapPromise;
}
