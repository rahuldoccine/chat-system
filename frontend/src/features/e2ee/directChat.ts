import { getOrCreateDeviceId } from '../calls/deviceId';
import type { Message } from '../chat/types';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveAesGcmKey,
  ecdhSharedSecret,
  exportPublicKeySpki,
  generateEcdhKeyPair,
} from './crypto';
import * as e2eeApi from './e2eeApi';
import {
  decodeEnvelope,
  decodePayload,
  encodeEnvelope,
  encodePayload,
  E2EE_VERSION,
  isE2eeMessage,
  type DmV1Payload,
} from './protocol';
import { fingerprintPublicKeySpki } from './encoding';
import { getSignedPreKeyPrivate } from './keyStore';
import { getLocalKeyMaterial } from './keyAccess';
import { orderedPeerDeviceIds, rememberPeerDevice } from './peerDevice';
import { cachePeerPreKeyBundle, getCachedPeerPreKeyBundle } from './peerBundleCache';
import type { PreKeyBundle } from './e2eeApi';
import {
  getSentPlaintext,
  rememberSentPlaintext,
  rememberSentPayloadMeta,
} from './sentPlaintextCache';

export class E2eePeerNotReadyError extends Error {
  constructor(message = 'This contact has not finished encryption setup yet.') {
    super(message);
    this.name = 'E2eePeerNotReadyError';
  }
}

const identityFingerprintCache = new Map<string, string>();

async function getSenderFingerprint(senderUserId: string): Promise<string> {
  const cached = identityFingerprintCache.get(senderUserId);
  if (cached) return cached;
  const row = await e2eeApi.getIdentityKey(senderUserId);
  identityFingerprintCache.set(senderUserId, row.fingerprint);
  return row.fingerprint;
}

function hkdfSalt(identityFingerprint: string, spkId: string): string {
  return `${identityFingerprint}:${spkId}`;
}

async function fetchPeerPreKeyBundle(
  peerUserId: string,
  preferDeviceId?: string | null,
  offline = false,
): Promise<{ deviceId: string; bundle: PreKeyBundle }> {
  if (offline) {
    const remembered = preferDeviceId ?? null;
    if (remembered) {
      const cached = getCachedPeerPreKeyBundle(peerUserId, remembered);
      if (cached) return { deviceId: remembered, bundle: cached };
    }
    if (typeof sessionStorage !== 'undefined') {
      const prefix = `e2ee-peer-bundle:${peerUserId}:`;
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const deviceId = key.slice(prefix.length);
        const cached = getCachedPeerPreKeyBundle(peerUserId, deviceId);
        if (cached) return { deviceId, bundle: cached };
      }
    }
    throw new E2eePeerNotReadyError(
      'Connect once while online to set up encrypted messaging with this contact, then you can send offline.',
    );
  }

  const devices = await e2eeApi.listPeerDevices(peerUserId);
  const deviceIds = orderedPeerDeviceIds(peerUserId, devices, preferDeviceId);
  if (!deviceIds.length) {
    throw new E2eePeerNotReadyError();
  }

  let lastErr: unknown;
  for (const deviceId of deviceIds) {
    try {
      const bundle = await e2eeApi.fetchPreKeyBundle(peerUserId, deviceId);
      cachePeerPreKeyBundle(peerUserId, deviceId, bundle);
      return { deviceId, bundle };
    } catch (err) {
      lastErr = err;
      const cached = getCachedPeerPreKeyBundle(peerUserId, deviceId);
      if (cached) return { deviceId, bundle: cached };
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new E2eePeerNotReadyError();
}

export type EncryptDirectInput = {
  peerUserId: string;
  plaintext: string;
  contentMeta?: Record<string, unknown>;
  clientMessageId?: string;
  /** Peer device from their latest message (senderDeviceId) — targets active session. */
  preferPeerDeviceId?: string | null;
  /** Use cached keys / pre-key bundle without network. */
  offline?: boolean;
};

export type EncryptDirectResult = {
  ciphertext: string;
  contentMeta: Record<string, unknown>;
};

export async function encryptDirectMessage(
  userId: string,
  input: EncryptDirectInput,
): Promise<EncryptDirectResult> {
  const material = await getLocalKeyMaterial(userId);
  if (!material) {
    throw new Error('E2EE keys not initialized');
  }

  const { deviceId: peerDeviceId, bundle } = await fetchPeerPreKeyBundle(
    input.peerUserId,
    input.preferPeerDeviceId,
    Boolean(input.offline),
  );
  rememberPeerDevice(input.peerUserId, peerDeviceId);

  const ephemeral = await generateEcdhKeyPair();
  const shared = await ecdhSharedSecret(
    ephemeral.privateKey,
    bundle.signedPreKey.publicKey,
  );
  // Salt must use sender fingerprint so the recipient can derive the same key.
  const senderFingerprint = await fingerprintPublicKeySpki(material.identityPublicSpki);
  const aesKey = await deriveAesGcmKey(
    shared,
    hkdfSalt(senderFingerprint, bundle.signedPreKey.keyId),
  );

  const innerMeta = { ...(input.contentMeta ?? {}) };
  delete innerMeta.e2eeVersion;
  delete innerMeta.preview;

  const payload: DmV1Payload = {
    text: input.plaintext,
    meta: Object.keys(innerMeta).length ? innerMeta : undefined,
  };

  const { iv, ct } = await aesGcmEncrypt(aesKey, encodePayload(payload));
  const ephemPub = await exportPublicKeySpki(ephemeral.publicKey);

  const envelope = encodeEnvelope({
    v: E2EE_VERSION,
    iv,
    ct,
    ephemPub,
    spkId: bundle.signedPreKey.keyId,
    otpkId: bundle.oneTimePreKey?.keyId ?? null,
  });

  if (input.clientMessageId) {
    rememberSentPlaintext(userId, input.clientMessageId, input.plaintext);
    if (Object.keys(innerMeta).length) {
      rememberSentPayloadMeta(userId, input.clientMessageId, innerMeta);
    }
  }

  return {
    ciphertext: envelope,
    contentMeta: {
      e2eeVersion: E2EE_VERSION,
      peerDeviceId,
      senderDeviceId: getOrCreateDeviceId(),
      senderFingerprint,
    },
  };
}

export async function decryptDirectMessage(
  userId: string,
  msg: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId' | 'clientMessageId'>,
  viewerId: string,
): Promise<string | null> {
  if (!isE2eeMessage(msg)) {
    return msg.ciphertext;
  }

  const cached = getSentPlaintext(userId, msg);
  if (cached) return cached;

  // Outgoing messages are encrypted for the peer's prekey; only local cache can show plaintext.
  if (msg.senderId === viewerId) {
    return null;
  }

  const envelope = decodeEnvelope(msg.ciphertext ?? '');
  if (!envelope) return null;

  const material = await getLocalKeyMaterial(userId);
  if (!material) return null;

  const meta = msg.contentMeta as Record<string, unknown> | undefined;
  let fingerprint =
    typeof meta?.senderFingerprint === 'string' ? meta.senderFingerprint : null;
  if (!fingerprint && msg.senderId !== viewerId) {
    try {
      fingerprint = await getSenderFingerprint(msg.senderId);
    } catch {
      return null;
    }
  }
  if (!fingerprint) return null;

  const spkIdsToTry = [
    envelope.spkId,
    ...material.signedPreKeys.map((k) => k.keyId).filter((id) => id !== envelope.spkId),
  ];

  for (const spkId of spkIdsToTry) {
    const spkPrivate = await getSignedPreKeyPrivate(material, spkId);
    if (!spkPrivate) continue;
    try {
      const shared = await ecdhSharedSecret(spkPrivate, envelope.ephemPub);
      const aesKey = await deriveAesGcmKey(shared, hkdfSalt(fingerprint, envelope.spkId));
      const plainBuf = await aesGcmDecrypt(aesKey, envelope.iv, envelope.ct);
      const payload = decodePayload(plainBuf);
      if (!payload) continue;

      if (payload.meta && typeof payload.meta === 'object') {
        const mediaBlob = (payload.meta as Record<string, unknown>).mediaBlob;
        if (typeof mediaBlob === 'string' && payload.text === '[encrypted-media]') {
          return payload.text;
        }
      }
      const senderDeviceId = meta?.senderDeviceId;
      if (typeof senderDeviceId === 'string') {
        rememberPeerDevice(msg.senderId, senderDeviceId);
      }
      return payload.text;
    } catch {
      /* try next local signed pre-key */
    }
  }

  return null;
}

export { isE2eeMessage };
