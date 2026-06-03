import type { Message } from '../chat/types';
import type { FileAttachmentMeta } from '../chat/utils/fileMeta';
import { isPlainObject } from '../../utils/plainObject';

function hasExtension(lower: string, extensions: readonly string[]): boolean {
  return extensions.some((ext) => lower.endsWith(ext));
}

function inferMime(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (hasExtension(lower, ['.jpg', '.jpeg'])) return 'image/jpeg';
  if (hasExtension(lower, ['.png'])) return 'image/png';
  if (hasExtension(lower, ['.gif'])) return 'image/gif';
  if (hasExtension(lower, ['.webp'])) return 'image/webp';
  if (hasExtension(lower, ['.mp4', '.webm', '.mov'])) return 'video/mp4';
  if (hasExtension(lower, ['.mp3', '.m4a', '.wav', '.ogg'])) return 'audio/mpeg';
  if (hasExtension(lower, ['.pdf'])) return 'application/pdf';
  return undefined;
}

function parseTransportStubEntry(entry: Record<string, unknown>): FileAttachmentMeta | null {
  const filename =
    (typeof entry.filename === 'string' && entry.filename) ||
    (typeof entry.originalName === 'string' && entry.originalName) ||
    undefined;
  const uploadId = typeof entry.uploadId === 'string' ? entry.uploadId : undefined;
  const url = typeof entry.url === 'string' ? entry.url : undefined;
  if (!filename && !uploadId && !url) return null;
  const originalName = (typeof entry.originalName === 'string' && entry.originalName) || filename;
  return {
    uploadId,
    url,
    filename,
    originalName,
    mimetype:
      (typeof entry.mimetype === 'string' && entry.mimetype) ||
      (originalName ? inferMime(originalName) : undefined),
    width: typeof entry.width === 'number' ? entry.width : undefined,
    height: typeof entry.height === 'number' ? entry.height : undefined,
  };
}

export function getTransportAttachmentStubs(
  contentMeta: Message['contentMeta'],
): FileAttachmentMeta[] | null {
  if (!contentMeta) return null;
  const raw = contentMeta.attachmentRefs?.files;
  if (!Array.isArray(raw) || !raw.length) return null;

  const stubs: FileAttachmentMeta[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const stub = parseTransportStubEntry(entry);
    if (stub) stubs.push(stub);
  }
  return stubs.length ? stubs : null;
}

export function mergeContentMetaWithStubs(
  contentMeta: Message['contentMeta'],
  decryptedMeta?: Record<string, unknown>,
): Message['contentMeta'] {
  const base: Message['contentMeta'] = { ...contentMeta, ...decryptedMeta };
  const files = base?.files;
  if (Array.isArray(files) && files.length > 0) return base;

  const stubs = getTransportAttachmentStubs(contentMeta);
  if (stubs?.length && base) base.files = stubs;
  return base;
}
