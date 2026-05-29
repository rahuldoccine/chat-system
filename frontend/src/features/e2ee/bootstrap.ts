import { getOrCreateDeviceId } from '../calls/deviceId';
import { signBytes } from './crypto';
import { fingerprintPublicKeySpki } from './encoding';
import {
  addOneTimePreKeys,
  getSigningPrivate,
  type E2eeKeyMaterial,
} from './keyStore';
import * as e2eeApi from './e2eeApi';
import { E2eeKeysLockedError, resolveKeyMaterial } from './accountSync';
import { getLocalKeyMaterial } from './keyAccess';

const MIN_ONE_TIME_PREKEYS = 10;
const BOOTSTRAP_LABEL = 'Web browser';

let bootstrapPromise: Promise<void> | null = null;
let lastBootstrapKey = '';

export type EnsureE2eeOptions = {
  /** Login/register password — restores wrapped keys from server when local storage is empty. */
  password?: string;
  /** Skip server key publish when offline but local keys exist. */
  offline?: boolean;
};

async function publishKeys(material: E2eeKeyMaterial, deviceId: string): Promise<void> {
  const fingerprint = await fingerprintPublicKeySpki(material.identityPublicSpki);
  try {
    await e2eeApi.putIdentityKey(material.identityPublicSpki, fingerprint);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 409) {
      throw new E2eeKeysLockedError(
        'This device has different encryption keys than your account. Unlock with your password to restore.',
      );
    }
    throw err;
  }
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

export async function ensureE2eeReady(
  userId: string,
  options: EnsureE2eeOptions = {},
): Promise<void> {
  const cacheKey = `${userId}:${options.password ? '1' : '0'}:${options.offline ? 'off' : 'on'}`;
  if (bootstrapPromise && lastBootstrapKey === cacheKey) return bootstrapPromise;

  lastBootstrapKey = cacheKey;
  bootstrapPromise = (async () => {
    const deviceId = getOrCreateDeviceId();
    const material = await resolveKeyMaterial(userId, options.password);
    const offline = Boolean(options.offline);
    if (offline) {
      const local = await getLocalKeyMaterial(userId);
      if (!local) {
        throw new E2eeKeysLockedError(
          'You are offline and encryption keys are not available on this device. Connect and sign in again.',
        );
      }
      return;
    }
    await publishKeys(material, deviceId);
  })()
    .catch((err) => {
      if (!(err instanceof E2eeKeysLockedError)) {
        console.error('[e2ee] bootstrap failed', err);
      }
      throw err;
    })
    .finally(() => {
      bootstrapPromise = null;
    });
  return bootstrapPromise;
}

export { E2eeKeysLockedError };
