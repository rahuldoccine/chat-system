import type { FileAttachmentMeta } from '../chat/utils/fileMeta';
import { buildFileUrl } from '../chat/utils/fileUrl';
import type { ContentMeta, Message } from '../chat/types';
import { isPlainObject } from '../../utils/plainObject';
import { aesGcmDecrypt, aesGcmDecryptBytes, aesGcmEncrypt, deriveAesGcmKey, ecdhSharedSecret } from './crypto';
import { bufToB64, b64ToBuf } from './encoding';
import { decodeEnvelope, decodePayload, isGroupE2eeMessage } from './protocol';
import { getSignedPreKeyPrivate, loadKeyMaterial } from './keyStore';
import * as e2eeApi from './e2eeApi';
import { isE2eeMessage } from './directChat';
import { getCachedPayloadMeta } from './decryptMessagePayload';

export type E2eeFileAttachmentKeys = {
  fileKey: string;
  iv: string;
};

export type EncryptedFileUpload = {
  encryptedBlob: Blob;
  attachment: E2eeFileAttachmentKeys;
};

/** Encrypt file bytes for server upload; keys are stored in the message payload meta. */
export async function encryptFileBlob(plaintext: ArrayBuffer): Promise<EncryptedFileUpload> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const { iv, ct } = await aesGcmEncrypt(aesKey, new Uint8Array(plaintext));
  const encryptedBlob = new Blob([b64ToBuf(ct)], { type: 'application/octet-stream' });
  return {
    encryptedBlob,
    attachment: { fileKey: bufToB64(rawKey.buffer), iv },
  };
}

type FileMetaEntry = FileAttachmentMeta & { attachment?: E2eeFileAttachmentKeys };

function filesFromMeta(meta: ContentMeta | undefined): FileMetaEntry[] {
  const bundled = meta?.files;
  if (!Array.isArray(bundled)) return [];
  return bundled as FileMetaEntry[];
}

function matchFileEntry(files: FileMetaEntry[], file: FileAttachmentMeta): FileMetaEntry | undefined {
  return files.find(
    (f) =>
      (file.uploadId && f.uploadId === file.uploadId) ||
      (file.url && f.url === file.url) ||
      (file.filename && f.filename === file.filename) ||
      (file.originalName && f.originalName === file.originalName),
  );
}

export function resolveFileAttachmentKeys(
  file: FileAttachmentMeta,
  transportMeta?: ContentMeta,
): E2eeFileAttachmentKeys | null {
  const direct = (file as FileMetaEntry).attachment;
  if (direct?.fileKey && direct.iv) return direct;

  if (!transportMeta) return null;
  const hit = matchFileEntry(filesFromMeta(transportMeta), file);
  if (hit?.attachment?.fileKey && hit.attachment.iv) return hit.attachment;
  return null;
}

async function resolveFingerprint(
  msg: Pick<Message, 'contentMeta' | 'senderId'>,
): Promise<string | null> {
  const meta = msg.contentMeta;
  if (typeof meta?.senderFingerprint === 'string') return meta.senderFingerprint;
  try {
    const row = await e2eeApi.getIdentityKey(msg.senderId);
    return row.fingerprint;
  } catch {
    return null;
  }
}

async function decryptMessagePayloadMeta(
  userId: string,
  msg: Pick<Message, 'ciphertext' | 'contentMeta' | 'senderId'>,
): Promise<Record<string, unknown> | null> {
  const envelope = decodeEnvelope(msg.ciphertext ?? '');
  if (!envelope) return null;

  const material = await loadKeyMaterial(userId);
  if (!material) return null;

  const spkPrivate = await getSignedPreKeyPrivate(material, envelope.spkId);
  if (!spkPrivate) return null;

  const fingerprint = await resolveFingerprint(msg);
  if (!fingerprint) return null;

  const shared = await ecdhSharedSecret(spkPrivate, envelope.ephemPub);
  const aesKey = await deriveAesGcmKey(shared, `${fingerprint}:${envelope.spkId}`);

  try {
    const plainBuf = await aesGcmDecrypt(aesKey, envelope.iv, envelope.ct);
    const payload = decodePayload(plainBuf);
    if (isPlainObject(payload?.meta)) {
      return payload.meta;
    }
  } catch {
    return null;
  }
  return null;
}

type MessageTransportFields = Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;

async function resolveTransportMeta(
  userId: string,
  msg: MessageTransportFields,
  _viewerId: string,
  transportMeta?: ContentMeta,
): Promise<ContentMeta | undefined> {
  const hasFileKeys = (meta: ContentMeta | undefined) => {
    const files = meta?.files;
    if (!Array.isArray(files)) return false;
    return files.some((entry) => {
      const f: unknown = entry;
      if (!isPlainObject(f)) return false;
      const attachment = f['attachment'];
      return isPlainObject(attachment) && typeof attachment.fileKey === 'string';
    });
  };

  if (transportMeta && hasFileKeys(transportMeta)) return transportMeta;

  if (isE2eeMessage(msg) && 'id' in msg) {
    const cached = getCachedPayloadMeta(userId, msg as Message);
    if (cached && Object.keys(cached).length) return cached;
  }

  if (transportMeta && Object.keys(transportMeta).length) return transportMeta;
  if (!isE2eeMessage(msg)) return transportMeta;

  const fromEnvelope = await decryptMessagePayloadMeta(userId, msg);
  return fromEnvelope ?? transportMeta;
}

export async function decryptFileBlob(
  keys: E2eeFileAttachmentKeys,
  encrypted: ArrayBuffer,
): Promise<ArrayBuffer | null> {
  try {
    const fileKey = await crypto.subtle.importKey(
      'raw',
      b64ToBuf(keys.fileKey),
      'AES-GCM',
      false,
      ['decrypt'],
    );
    return aesGcmDecryptBytes(fileKey, keys.iv, encrypted);
  } catch {
    return null;
  }
}

export async function fetchEncryptedFileBytes(
  file: FileAttachmentMeta,
  token: string | null,
): Promise<ArrayBuffer | null> {
  const url = buildFileUrl(file, token);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.arrayBuffer();
}

/** Decrypt one attachment for an E2EE message (multi-file safe). */
export async function decryptMessageFile(
  userId: string,
  msg: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>,
  file: FileAttachmentMeta,
  viewerId: string,
  token: string | null,
  transportMeta?: ContentMeta,
): Promise<Blob | null> {
  if (!isE2eeMessage(msg)) {
    const buf = await fetchEncryptedFileBytes(file, token);
    if (!buf) return null;
    return new Blob([buf], { type: file.mimetype || 'application/octet-stream' });
  }

  let keys = resolveFileAttachmentKeys(file, transportMeta);
  if (!keys) {
    const meta = await resolveTransportMeta(userId, msg, viewerId, transportMeta);
    keys = resolveFileAttachmentKeys(file, meta);
  }
  if (!keys) {
    // For GROUP E2EE messages, attachments may be uploaded without per-file encrypt/decrypt keys.
    // In that case, fall back to returning the fetched bytes as a plain attachment.
    if (isGroupE2eeMessage(msg)) {
      const buf = await fetchEncryptedFileBytes(file, token);
      if (!buf) return null;
      return new Blob([buf], { type: file.mimetype || 'application/octet-stream' });
    }
    return null;
  }

  const encrypted = await fetchEncryptedFileBytes(file, token);
  if (!encrypted) return null;

  const plain = await decryptFileBlob(keys, encrypted);
  if (!plain) return null;

  return new Blob([plain], { type: file.mimetype || 'application/octet-stream' });
}
