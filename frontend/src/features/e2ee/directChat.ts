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
import { getSignedPreKeyPrivate, loadKeyMaterial } from './keyStore';
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

async function resolvePeerDevice(peerUserId: string): Promise<{ deviceId: string }> {
  const devices = await e2eeApi.listPeerDevices(peerUserId);
  const active = devices[0];
  if (!active?.deviceId) {
    throw new E2eePeerNotReadyError();
  }
  return { deviceId: active.deviceId };
}

export type EncryptDirectInput = {
  peerUserId: string;
  plaintext: string;
  contentMeta?: Record<string, unknown>;
  clientMessageId?: string;
};

export type EncryptDirectResult = {
  ciphertext: string;
  contentMeta: Record<string, unknown>;
};

export async function encryptDirectMessage(
  userId: string,
  input: EncryptDirectInput,
): Promise<EncryptDirectResult> {
  const material = await loadKeyMaterial(userId);
  if (!material) {
    throw new Error('E2EE keys not initialized');
  }

  const { deviceId: peerDeviceId } = await resolvePeerDevice(input.peerUserId);
  const bundle = await e2eeApi.fetchPreKeyBundle(input.peerUserId, peerDeviceId);

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

  const material = await loadKeyMaterial(userId);
  if (!material) return null;

  const spkPrivate = await getSignedPreKeyPrivate(material, envelope.spkId);
  if (!spkPrivate) return null;

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

  const shared = await ecdhSharedSecret(spkPrivate, envelope.ephemPub);
  const aesKey = await deriveAesGcmKey(shared, hkdfSalt(fingerprint, envelope.spkId));

  try {
    const plainBuf = await aesGcmDecrypt(aesKey, envelope.iv, envelope.ct);
    const payload = decodePayload(plainBuf);
    if (!payload) return null;

    if (payload.meta && typeof payload.meta === 'object') {
      const mediaBlob = (payload.meta as Record<string, unknown>).mediaBlob;
      if (typeof mediaBlob === 'string' && payload.text === '[encrypted-media]') {
        return payload.text;
      }
    }
    return payload.text;
  } catch {
    return null;
  }
}

export { isE2eeMessage };
