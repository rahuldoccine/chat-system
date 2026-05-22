/**
 * Cleartext line for Web Push (stored in transport contentMeta.pushPreview on E2EE DMs).
 * Lets the server show message text / media labels without decrypting ciphertext.
 */

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

  const poll = meta?.poll;
  if (poll && typeof poll === 'object') {
    const q = (poll as { question?: string }).question?.trim();
    if (q) return q.length <= 120 ? q : `${q.slice(0, 119)}…`;
    return 'Poll';
  }

  const files = meta?.files;
  if (Array.isArray(files) && files.length > 0) {
    if (caption) return caption;

    const imageCount = files.filter((f) => {
      if (!f || typeof f !== 'object') return false;
      const rec = f as { mimetype?: string };
      return (rec.mimetype ?? '').toLowerCase().startsWith('image/');
    }).length;

    if (imageCount === files.length) {
      return files.length === 1 ? 'Photo' : `Sent ${files.length} photos`;
    }

    if (files.length === 1) {
      const f = files[0] as {
        mimetype?: string;
        originalName?: string;
        filename?: string;
      };
      const mime = (f.mimetype ?? '').toLowerCase();
      const name = f.originalName || f.filename;
      if (mime.startsWith('video/')) return name || 'Video';
      if (mime.startsWith('audio/')) return name || 'Audio';
      if (mime.startsWith('image/') || kind === 'IMAGE') return name || 'Photo';
      return name || 'File';
    }

    return `Sent ${files.length} files`;
  }

  if (caption) return caption;

  if (kind === 'IMAGE') return 'Photo';
  if (kind === 'FILE') return 'File';
  if (kind === 'POLL') return 'Poll';
  return 'New message';
}
