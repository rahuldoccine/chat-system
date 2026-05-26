import type { Message } from '../chat/types';
import type { FileAttachmentMeta } from '../chat/utils/fileMeta';

function inferMime(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (/\.(jpe?g)$/.test(lower)) return 'image/jpeg';
  if (/\.png$/.test(lower)) return 'image/png';
  if (/\.gif$/.test(lower)) return 'image/gif';
  if (/\.webp$/.test(lower)) return 'image/webp';
  if (/\.(mp4|webm|mov)$/.test(lower)) return 'video/mp4';
  if (/\.(mp3|m4a|wav|ogg)$/.test(lower)) return 'audio/mpeg';
  if (/\.pdf$/.test(lower)) return 'application/pdf';
  return undefined;
}

export function getTransportAttachmentStubs(
  contentMeta: Message['contentMeta'],
): FileAttachmentMeta[] | null {
  if (!contentMeta) return null;
  const refs = (contentMeta as Record<string, unknown>).attachmentRefs as
    | { files?: unknown }
    | undefined;
  const raw = refs?.files;
  if (!Array.isArray(raw) || !raw.length) return null;

  const stubs: FileAttachmentMeta[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    const filename =
      (typeof r.filename === 'string' && r.filename) ||
      (typeof r.originalName === 'string' && r.originalName) ||
      undefined;
    const uploadId = typeof r.uploadId === 'string' ? r.uploadId : undefined;
    const url = typeof r.url === 'string' ? r.url : undefined;
    if (!filename && !uploadId && !url) continue;
    const originalName =
      (typeof r.originalName === 'string' && r.originalName) || filename;
    stubs.push({
      uploadId,
      url,
      filename,
      originalName,
      mimetype:
        (typeof r.mimetype === 'string' && r.mimetype) ||
        (originalName ? inferMime(originalName) : undefined),
      width: typeof r.width === 'number' ? r.width : undefined,
      height: typeof r.height === 'number' ? r.height : undefined,
    });
  }
  return stubs.length ? stubs : null;
}

export function mergeContentMetaWithStubs(
  contentMeta: Message['contentMeta'],
  decryptedMeta?: Record<string, unknown>,
): Message['contentMeta'] {
  const base = { ...(contentMeta ?? {}), ...(decryptedMeta ?? {}) } as Record<string, unknown>;
  const files = base.files;
  if (Array.isArray(files) && files.length > 0) return base as Message['contentMeta'];

  const stubs = getTransportAttachmentStubs(contentMeta);
  if (stubs?.length) base.files = stubs;
  return base as Message['contentMeta'];
}
