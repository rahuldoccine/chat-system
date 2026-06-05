import type { Message } from '../types';

export type FileAttachmentMeta = {
  url?: string;
  filename?: string;
  originalName?: string;
  mimetype?: string;
  size?: number;
  uploadId?: string;
  width?: number;
  height?: number;
};

export function isAudioMime(mimetype?: string): boolean {
  const m = (mimetype ?? '').toLowerCase();
  return m.startsWith('audio/') || m === 'video/webm';
}

export function isVideoMime(mimetype?: string): boolean {
  const m = (mimetype ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  return m.startsWith('video/');
}

export function isVoiceMessage(message: Pick<Message, 'kind' | 'contentMeta'>): boolean {
  return message.contentMeta?.voiceNote === true;
}

type FileMimeFields = Pick<FileAttachmentMeta, 'mimetype' | 'originalName' | 'filename'>;

export function isVideoFile(file: FileMimeFields): boolean {
  const mime = (file.mimetype ?? '').toLowerCase();
  if (isVideoMime(mime)) return true;
  const name = (file.originalName ?? file.filename ?? '').toLowerCase();
  return /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(name);
}

export function isAudioFile(file: FileMimeFields): boolean {
  const mime = (file.mimetype ?? '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  const name = (file.originalName ?? file.filename ?? '').toLowerCase();
  return /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(name);
}

export function getVoiceDurationMs(
  meta: Message['contentMeta'] | undefined,
): number | undefined {
  const ms = meta?.durationMs;
  return typeof ms === 'number' && ms > 0 ? ms : undefined;
}

export function isImageFile(file: Pick<FileAttachmentMeta, 'mimetype' | 'originalName' | 'filename'>): boolean {
  const mime = (file.mimetype ?? '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = (file.originalName ?? file.filename ?? '').toLowerCase();
  return /\.(gif|jpe?g|png|webp|bmp|svg)$/i.test(name);
}

export function getFileTypeLabel(mimetype?: string, filename?: string): string {
  const m = (mimetype ?? '').toLowerCase();
  const name = (filename ?? '').toLowerCase();
  if (m.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(name)) return 'Video';
  if (m.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(name)) return 'Audio';
  if (m.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (name.endsWith('.docx') || m.includes('wordprocessingml')) return 'Word Document';
  if (name.endsWith('.doc') || m.includes('msword')) return 'Word Document';
  if (name.endsWith('.csv') || m === 'text/csv') return 'CSV';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || m.includes('spreadsheet') || m.includes('excel'))
    return 'Excel Spreadsheet';
  if (m.startsWith('image/')) return 'Image';
  return 'File';
}

export function getFileTypeBadge(mimetype?: string, filename?: string): { letter: string; className: string } {
  const m = (mimetype ?? '').toLowerCase();
  const name = (filename ?? '').toLowerCase();
  if (m.startsWith('image/') || /\.(gif|jpe?g|png|webp|bmp|svg)$/i.test(name)) {
    return { letter: 'IMG', className: 'badgeImage' };
  }
  if (m.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(name)) {
    return { letter: 'VID', className: 'badgeVideo' };
  }
  if (m.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(name)) {
    return { letter: 'AUD', className: 'badgeAudio' };
  }
  if (m.includes('pdf') || name.endsWith('.pdf')) return { letter: 'PDF', className: 'badgePdf' };
  if (name.endsWith('.docx') || name.endsWith('.doc') || m.includes('word')) return { letter: 'W', className: 'badgeWord' };
  if (name.endsWith('.csv') || m === 'text/csv') return { letter: 'CSV', className: 'badgeSheet' };
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || m.includes('spreadsheet') || m.includes('excel'))
    return { letter: 'X', className: 'badgeSheet' };
  return { letter: 'F', className: 'badgeDefault' };
}

export function getMessageFiles(message: Pick<Message, 'kind' | 'contentMeta'>): FileAttachmentMeta[] | null {
  const meta = message.contentMeta;
  if (!meta) return null;

  const bundled = meta.files;
  if (Array.isArray(bundled) && bundled.length > 0) {
    return bundled;
  }

  if (message.kind && message.kind !== 'TEXT' && (meta.filename || meta.url)) {
    return [meta as FileAttachmentMeta];
  }

  return null;
}

export function getAttachmentPreviewLabel(message: Pick<Message, 'kind' | 'contentMeta'>): string {
  if (isVoiceMessage(message)) return 'Voice message';
  const files = getMessageFiles(message);
  const primary = files?.[0];
  if (primary && isVideoFile(primary)) return 'Video';
  if (primary && isAudioFile(primary)) return 'Audio';
  if (message.kind === 'IMAGE') return 'Photo';
  if (message.kind === 'FILE') return 'File';
  if (message.kind === 'POLL') return 'Poll';
  return 'New message';
}

/** Use grid file cards for multi-file / non-image attachments. Single images use the image preview UI. */
export function shouldUseGroupedFileLayout(message: Pick<Message, 'kind' | 'contentMeta'>): boolean {
  if (isVoiceMessage(message)) return false;
  const files = getMessageFiles(message);
  if (!files?.length) return false;
  if (files.length > 1) return true;
  if (message.kind === 'IMAGE') return false;
  if (isImageFile(files[0])) return false;
  if (isVideoFile(files[0])) return false;
  if (isAudioFile(files[0])) return false;
  return true;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function isComposerVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name);
}

export function isComposerAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  return /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name);
}
