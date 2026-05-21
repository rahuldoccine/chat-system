import { decryptMessageFile } from '../../e2ee/attachmentCrypto';
import { isE2eeMessage } from '../../e2ee/directChat';
import type { Message } from '../types';
import { buildFileUrl } from './fileUrl';
import type { FileAttachmentMeta } from './fileMeta';
import { downloadBlob, downloadFileFromUrl } from './downloadFile';

export type FileMessageRef = Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>;

/** Plain API URL or decrypted blob URL for preview/download. */
export async function resolveFileAccessUrl(
  message: FileMessageRef,
  file: FileAttachmentMeta,
  transportMeta: Record<string, unknown> | undefined,
  userId: string | undefined,
  token: string | null,
): Promise<string | null> {
  if (isE2eeMessage(message) && userId) {
    const blob = await decryptMessageFile(userId, message, file, userId, token, transportMeta);
    if (blob) return URL.createObjectURL(blob);
    return null;
  }
  const url = buildFileUrl(file, token);
  return url || null;
}

export async function downloadMessageFile(
  message: FileMessageRef,
  file: FileAttachmentMeta,
  transportMeta: Record<string, unknown> | undefined,
  userId: string | undefined,
  token: string | null,
  filename: string,
): Promise<void> {
  if (isE2eeMessage(message) && userId) {
    const blob = await decryptMessageFile(userId, message, file, userId, token, transportMeta);
    if (blob) downloadBlob(blob, filename);
    return;
  }
  const url = buildFileUrl(file, token);
  if (!url) return;
  await downloadFileFromUrl(url, filename);
}
