import { buildFileUrl } from './fileUrl';
import { downloadBlob, downloadFileFromUrl } from './downloadFile';
import type { FileAttachmentMeta } from './fileMeta';
import type { Message } from '../types';

export async function resolveFileAccessUrl(
  _message: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>,
  file: FileAttachmentMeta,
  _transportMeta: Record<string, unknown> | undefined,
  _userId: string | undefined,
  token: string | null | undefined,
): Promise<string | null> {
  const url = buildFileUrl(file, token ?? null);
  return url || null;
}

export async function downloadMessageFile(
  _message: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>,
  file: FileAttachmentMeta,
  _transportMeta: Record<string, unknown> | undefined,
  _userId: string | undefined,
  token: string | null | undefined,
  displayName: string,
): Promise<void> {
  const url = buildFileUrl(file, token ?? null);
  if (!url) return;
  await downloadFileFromUrl(url, displayName);
}

export async function downloadMessageFileAsBlob(
  message: Pick<Message, 'id' | 'ciphertext' | 'contentMeta' | 'senderId'>,
  file: FileAttachmentMeta,
  transportMeta: Record<string, unknown> | undefined,
  userId: string | undefined,
  token: string | null | undefined,
): Promise<Blob | null> {
  const url = await resolveFileAccessUrl(message, file, transportMeta, userId, token);
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.blob();
}

export { downloadBlob };
