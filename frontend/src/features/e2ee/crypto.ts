import { bufToB64, b64ToBuf } from './encoding';

const ECDH_PARAMS: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };
const ECDSA_PARAMS: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };

export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveBits']);
}

export async function generateEcdsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDSA_PARAMS, true, ['sign', 'verify']);
}

export async function exportPublicKeySpki(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('spki', publicKey);
  return bufToB64(raw);
}

export async function importPublicKeySpki(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', b64ToBuf(spkiB64), ECDH_PARAMS, true, []);
}

export async function exportPrivateKeyJwk(privateKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', privateKey);
}

export async function importEcdhPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDH_PARAMS, true, ['deriveBits']);
}

export async function importEcdsaPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDSA_PARAMS, true, ['sign']);
}

export async function importEcdsaPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', b64ToBuf(spkiB64), ECDSA_PARAMS, true, ['verify']);
}

export async function ecdhSharedSecret(
  privateKey: CryptoKey,
  peerPublicSpki: string,
): Promise<ArrayBuffer> {
  const peerPublic = await importPublicKeySpki(peerPublicSpki);
  return crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublic },
    privateKey,
    256,
  );
}

export async function deriveAesGcmKey(
  sharedBits: ArrayBuffer,
  saltInput: string,
): Promise<CryptoKey> {
  const salt = new TextEncoder().encode(saltInput);
  const keyMaterial = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('dm-v1'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    plaintext as BufferSource,
  );
  return { iv: bufToB64(iv.buffer), ct: bufToB64(ct) };
}

export async function aesGcmDecrypt(
  key: CryptoKey,
  ivB64: string,
  ctB64: string,
): Promise<ArrayBuffer> {
  const iv = new Uint8Array(b64ToBuf(ivB64));
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    b64ToBuf(ctB64),
  );
}

/** Decrypt ciphertext stored as raw bytes (e.g. uploaded E2EE file blobs). */
export async function aesGcmDecryptBytes(
  key: CryptoKey,
  ivB64: string,
  ct: ArrayBuffer,
): Promise<ArrayBuffer> {
  const iv = new Uint8Array(b64ToBuf(ivB64));
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
}

export async function signBytes(privateKey: CryptoKey, data: Uint8Array): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data as BufferSource,
  );
  return bufToB64(sig);
}

export async function wrapKeyBackup(
  passphrase: string,
  material: string,
): Promise<{ wrapAlg: string; wrapped: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 310_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(material),
  );
  const wrapped = JSON.stringify({
    salt: bufToB64(salt.buffer),
    iv: bufToB64(iv.buffer),
    ct: bufToB64(ct),
  });
  return { wrapAlg: 'pbkdf2-aes-gcm-v1', wrapped };
}

export async function unwrapKeyBackup(
  passphrase: string,
  wrapped: string,
): Promise<string> {
  const { salt, iv, ct } = JSON.parse(wrapped) as { salt: string; iv: string; ct: string };
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(b64ToBuf(salt)),
      iterations: 310_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(iv)) },
    aesKey,
    b64ToBuf(ct),
  );
  return new TextDecoder().decode(plain);
}
