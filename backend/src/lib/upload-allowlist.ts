import path from "node:path";

import type { UploadFileKind } from "@prisma/client";

/** Declared MIME types accepted for chat uploads (self-hosted). */
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
]);

const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]);

const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/rtf",
  "text/csv",
]);

const ALL_ALLOWED = new Set([...IMAGE_MIMES, ...AUDIO_MIMES, ...VIDEO_MIMES, ...DOCUMENT_MIMES]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/flac": ".flac",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/x-matroska": ".mkv",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/rtf": ".rtf",
  "text/csv": ".csv",
};

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".rtf": "application/rtf",
  ".csv": "text/csv",
};

export function mimeFromExtension(originalname: string): string | null {
  const ext = path.extname(originalname).toLowerCase();
  if (!ext) return null;
  return EXT_TO_MIME[ext] ?? null;
}

/**
 * Resolve MIME from browser declaration or safe filename extension
 * (e.g. application/octet-stream for Office docs or E2EE ciphertext with original name).
 */
export function resolveDeclaredUploadMime(originalname: string, declaredMime: string): string | null {
  const mime = declaredMime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (isAllowedUploadMime(mime)) return mime;
  const fromExt = mimeFromExtension(originalname);
  if (fromExt && isAllowedUploadMime(fromExt)) return fromExt;
  return null;
}

export function isAllowedUploadMime(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return ALL_ALLOWED.has(m);
}

export function isAudioMime(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return AUDIO_MIMES.has(m);
}

export function isVideoMime(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return VIDEO_MIMES.has(m);
}

/** Voice notes and hold-to-record uploads (includes WebM variants). */
export function isVoiceCapableMime(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return isAudioMime(m) || m === "video/webm";
}

export function isImageMime(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return IMAGE_MIMES.has(m);
}

export function safeExtensionForMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return MIME_TO_EXT[m] ?? "";
}

export function inferUploadKind(mime: string, opts: { voiceNote?: boolean }): UploadFileKind {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (opts.voiceNote && (isVoiceCapableMime(m) || m === "application/octet-stream")) return "VOICE";
  if (IMAGE_MIMES.has(m)) return "IMAGE";
  if (VIDEO_MIMES.has(m)) return "VIDEO";
  if (AUDIO_MIMES.has(m)) return "AUDIO";
  if (DOCUMENT_MIMES.has(m)) return "DOCUMENT";
  return "OTHER";
}

/** Reject original filename extensions that could execute in browser or OS. */
export function isDangerousOriginalName(originalname: string): boolean {
  const ext = path.extname(originalname).toLowerCase();
  const blocked = new Set([
    ".html",
    ".htm",
    ".svg",
    ".exe",
    ".dll",
    ".sh",
    ".bat",
    ".cmd",
    ".js",
    ".mjs",
    ".cjs",
    ".php",
    ".jar",
  ]);
  return blocked.has(ext);
}

export function shouldForceAttachmentDisposition(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (m === "image/svg+xml") return true;
  if (m.startsWith("text/")) return true;
  if (DOCUMENT_MIMES.has(m)) return true;
  return false;
}
