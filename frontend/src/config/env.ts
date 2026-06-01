/**
 * Central app config from Vite env (.env / .env.example).
 * Copy frontend/.env.example → frontend/.env and adjust for your environment.
 */

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readList(value: string | undefined, fallback: string): string[] {
  return readString(value, fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const apiUrl = readString(import.meta.env.VITE_API_URL, 'http://localhost:4000/api/v1').replaceAll(
  /\/$/g,
  '',
);

export const env = {
  /** REST API base, e.g. http://localhost:4000/api/v1 */
  apiUrl,

  /** Origin without /api/v1 - used for file URLs and sockets */
  get apiOrigin(): string {
    return apiUrl.replaceAll(/\/api\/v1$/gi, '');
  },

  /** Path prefix for uploaded files (default /api/v1/files) */
  filesApiPath: readString(import.meta.env.VITE_FILES_API_PATH, '/api/v1/files').replaceAll(/\/$/g, ''),

  /** Socket.IO server URL */
  socketUrl: readString(import.meta.env.VITE_SOCKET_URL, 'http://localhost:4000'),

  /** Giphy API key - https://developers.giphy.com/dashboard/ */
  giphyApiKey: readString(import.meta.env.VITE_GIPHY_API_KEY, ''),

  giphyApiBase: readString(import.meta.env.VITE_GIPHY_API_BASE, 'https://api.giphy.com/v1/gifs').replaceAll(
    /\/$/g,
    '',
  ),

  giphySearchLimit: readNumber(import.meta.env.VITE_GIPHY_SEARCH_LIMIT, 24),

  /**
   * GIF upload quality from Giphy: hd (original, up to max MB), balanced (downsized_large), fast (smaller).
   */
  giphyDownloadQuality: readString(import.meta.env.VITE_GIPHY_DOWNLOAD_QUALITY, 'hd') as
    | 'hd'
    | 'balanced'
    | 'fast',

  /** Max bytes for Giphy `original` before falling back to downsized_large (default 8 MB). */
  giphyMaxDownloadBytes: readNumber(import.meta.env.VITE_GIPHY_MAX_DOWNLOAD_MB, 8) * 1024 * 1024,

  /** Dev scroll diagnostics ([MS:scroll] logs). Set to 0 to disable */
  scrollDebug:
    import.meta.env.DEV &&
    readString(import.meta.env.VITE_SCROLL_DEBUG, '1') !== '0' &&
    (typeof localStorage === 'undefined' || localStorage.getItem('chat-scroll-debug') !== '0'),

  maxAttachments: readNumber(import.meta.env.VITE_MAX_ATTACHMENTS, 10),

  /** Must match backend MAX_UPLOAD_MB for accurate client-side checks. */
  maxUploadMb: readNumber(import.meta.env.VITE_MAX_UPLOAD_MB, 10),

  /** Max hold-to-record voice note length in seconds (default 120). */
  maxVoiceNoteSeconds: readNumber(import.meta.env.VITE_MAX_VOICE_NOTE_SEC, 120),

  /** Comma-separated, e.g. .jpg,.png,.pdf */
  allowedFileExtensions: readList(
    import.meta.env.VITE_ALLOWED_FILE_EXTENSIONS,
    '.jpg,.jpeg,.png,.gif,.pdf,.xls,.xlsx,.csv,.docx,.mp4,.webm,.mov,.mp3,.m4a,.wav,.ogg,.aac',
  ),

  /** WebRTC STUN URLs (comma-separated). Default: Google public STUN. */
  stunUrls: readList(import.meta.env.VITE_STUN_URL, 'stun:stun.l.google.com:19302'),

  /** Optional TURN server URL (e.g. turn:your.host:3478) */
  turnUrl: readString(import.meta.env.VITE_TURN_URL, ''),

  turnUsername: readString(import.meta.env.VITE_TURN_USERNAME, ''),

  turnCredential: readString(import.meta.env.VITE_TURN_CREDENTIAL, ''),
} as const;

export function allowedFileAcceptAttribute(): string {
  return env.allowedFileExtensions.join(',');
}

export function maxUploadBytes(): number {
  return env.maxUploadMb * 1024 * 1024;
}

export function isGifPickerConfigured(): boolean {
  return Boolean(env.giphyApiKey);
}

/** Shown in the GIF picker when search is not configured. */
export const giphyMissingKeyMessage = 'GIF search is not available right now.';
