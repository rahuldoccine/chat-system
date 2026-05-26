import type { FileAttachmentMeta } from '../chat/utils/fileMeta';
import type { Message } from '../chat/types';

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

export function transportMetaDepKey(meta: Record<string, unknown> | undefined): string {
  if (!meta) return '';
  const parts: string[] = [];

  const pushFiles = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const r = entry as Record<string, unknown>;
      const att = r.attachment as { fileKey?: string; iv?: string } | undefined;
      parts.push(
        `${r.uploadId ?? ''}:${r.filename ?? ''}:${att?.fileKey ?? ''}:${att?.iv ?? ''}`,
      );
    }
  };

  pushFiles(meta.files);
  const refs = meta.attachmentRefs as { files?: unknown } | undefined;
  pushFiles(refs?.files);

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
