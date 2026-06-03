import type { FileAttachmentMeta } from '../chat/utils/fileMeta';
import type { ContentMeta, Message } from '../chat/types';
import { isPlainObject, unknownToDisplayString } from '../../utils/plainObject';

export function fileAttachmentIdentityKey(file: FileAttachmentMeta | undefined): string {
  if (!file) return '';
  return [file.uploadId ?? '', file.filename ?? '', file.url ?? ''].join('|');
}

export function fileAttachmentDepKey(file: FileAttachmentMeta | undefined): string {
  if (!file) return '';
  const att = file.attachment;
  return [fileAttachmentIdentityKey(file), att?.fileKey ?? '', att?.iv ?? ''].join('|');
}

export function fileHasDecryptKeys(file: FileAttachmentMeta | undefined): boolean {
  const att = file?.attachment;
  return Boolean(att?.fileKey && att?.iv);
}

export function transportMetaDepKey(meta: ContentMeta | undefined): string {
  if (!meta) return '';
  const parts: string[] = [];

  const pushFiles = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      if (!isPlainObject(entry)) continue;
      const att = entry.attachment as { fileKey?: string; iv?: string } | undefined;
      parts.push(
        `${unknownToDisplayString(entry.uploadId)}:${unknownToDisplayString(entry.filename)}:${att?.fileKey ?? ''}:${att?.iv ?? ''}`,
      );
    }
  };

  pushFiles(meta.files);
  pushFiles(meta.attachmentRefs?.files);

  if (meta.voiceNote) parts.push('voice');
  const dur = meta.durationMs;
  if (typeof dur === 'number') parts.push(`dur:${dur}`);

  return parts.join(';');
}

export function e2eeMessageDepKey(
  msg: Pick<Message, 'id' | 'ciphertext'> | undefined,
): string {
  if (!msg) return '';
  return `${msg.id}:${msg.ciphertext?.length ?? 0}`;
}
