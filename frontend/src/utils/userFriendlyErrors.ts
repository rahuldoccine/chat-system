/** Maps API / socket codes to plain-language messages for end users. */
const CODE_MESSAGES: Record<string, string> = {
  CALL_BUSY: 'This person is on another call. Try again in a few minutes.',
  CALL_EXISTS: 'A call is already in progress.',
  RATE_LIMIT: 'Too many attempts. Please wait a moment and try again.',
  NOT_CONNECTED: "You're offline. Check your internet connection and try again.",
  TIMEOUT: "That took too long. Please try again.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that. It may have been removed.",
  FILE_TOO_LARGE: 'This file is too large to send.',
  UNSUPPORTED_MEDIA_TYPE: 'This file type cannot be sent here.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNAUTHORIZED: 'Please sign in again.',
};

function isTechnicalMessage(msg: string): boolean {
  const t = msg.trim();
  if (!t || t.length < 3) return true;
  if (/^(GET|POST|PUT|PATCH|DELETE)\s/i.test(t)) return true;
  if (/ECONNREFUSED|ENOTFOUND|socket\.io|Network Error|Request failed|status code \d{3}|AxiosError/i.test(t)) return true;
  if (/prisma|validation failed|invalid input|must be a valid uuid/i.test(t)) return true;
  if (/^Users can only delete messages they sent$/i.test(t)) return false;
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(t)) return true;
  if (t.includes('::') || t.includes('undefined')) return true;
  return false;
}

export function friendlyCodeMessage(code: string | undefined, fallback: string): string {
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  return fallback;
}

/** Socket / call signaling ack errors. */
export function friendlySocketAckMessage(
  code?: string,
  serverMessage?: string,
  fallback = 'Something went wrong with the call. Please try again.',
): string {
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (serverMessage && !isTechnicalMessage(serverMessage)) return serverMessage;
  return fallback;
}

/** REST / axios errors shown in toasts and forms. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: { code?: string; message?: string } } }).response
      ?.data;
    if (data?.code && CODE_MESSAGES[data.code]) return CODE_MESSAGES[data.code];
    if (data?.message && !isTechnicalMessage(data.message)) return data.message;
  }
  if (error instanceof Error && error.message && !isTechnicalMessage(error.message)) {
    return error.message;
  }
  return fallback;
}
