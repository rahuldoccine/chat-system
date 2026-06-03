/**
 * Cleartext line for Web Push (stored in transport contentMeta.pushPreview on E2EE DMs).
 * Lets the server show message text / media labels without decrypting ciphertext.
 */

function pollPreviewText(meta: Record<string, unknown>): string | null {
  const poll = meta.poll;
  if (!poll || typeof poll !== 'object') return null;
  const q = (poll as { question?: string }).question?.trim();
  if (!q) return 'Poll';
  return q.length <= 120 ? q : `${q.slice(0, 119)}…`;
}

function isImageFile(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  return String((entry as { mimetype?: string }).mimetype ?? '').toLowerCase().startsWith('image/');
}

function singleFilePreview(
  file: { mimetype?: string; originalName?: string; filename?: string },
  kind: string,
): string {
  const mime = (file.mimetype ?? '').toLowerCase();
  const name = file.originalName || file.filename;
  if (mime.startsWith('video/')) return name || 'Video';
  if (mime.startsWith('audio/')) return name || 'Audio';
  if (mime.startsWith('image/') || kind === 'IMAGE') return name || 'Photo';
  return name || 'File';
}

function filesPreviewText(
  files: unknown[],
  caption: string,
  kind: string,
): string | null {
  if (!files.length) return null;
  if (caption) return caption;

  const imageCount = files.filter(isImageFile).length;
  if (imageCount === files.length) {
    return files.length === 1 ? 'Photo' : `Sent ${files.length} photos`;
  }
  if (files.length === 1) {
    return singleFilePreview(files[0] as { mimetype?: string; originalName?: string; filename?: string }, kind);
  }
  return `Sent ${files.length} files`;
}

function kindFallbackPreview(kind: string): string {
  if (kind === 'IMAGE') return 'Photo';
  if (kind === 'FILE') return 'File';
  if (kind === 'POLL') return 'Poll';
  return 'New message';
}

export function buildPushPreview(input: {
  text?: string;
  kind?: string;
  contentMeta?: Record<string, unknown> | null;
}): string {
  const meta = input.contentMeta ?? undefined;
  const caption = (input.text ?? '').trim();
  const kind = input.kind ?? 'TEXT';

  if (meta?.voiceNote === true) {
    return caption || 'Voice message';
  }

  const pollText = meta ? pollPreviewText(meta) : null;
  if (pollText) return pollText;

  const files = meta?.files;
  if (Array.isArray(files)) {
    const fileText = filesPreviewText(files, caption, kind);
    if (fileText) return fileText;
  }

  if (caption) return caption;
  return kindFallbackPreview(kind);
}
