import { isAudioMime, isImageMime, isVideoMime } from "./upload-allowlist.js";

/**
 * MIME compatibility between browser-declared types and `file-type` sniff results.
 * Only allows known-safe aliases - never upgrades to an unrelated type.
 */

const DECLARED_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "audio/mp3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "video/x-matroska": "video/x-matroska",
  "application/x-pdf": "application/pdf",
};

/** Pairs that share the same container/format but use different MIME labels. */
const EQUIVALENT_MIME_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["audio/webm", "video/webm"],
  ["audio/mp4", "video/mp4"],
  ["audio/wav", "audio/x-wav"],
  ["audio/mpeg", "audio/mp3"],
  ["application/pdf", "application/x-pdf"],
];

const ZIP_BASED_OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/msword",
]);

function normalizeMime(mime: string): string {
  return mime.toLowerCase().split(";")[0]?.trim() ?? "";
}

function normalizeDeclared(mime: string): string {
  const n = normalizeMime(mime);
  return DECLARED_ALIASES[n] ?? n;
}

function equivalentPair(a: string, b: string): boolean {
  return EQUIVALENT_MIME_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/** Audio-like types that may be labeled audio/* or video/webm by browser vs sniffer. */
function isAudioFamily(mime: string): boolean {
  return isAudioMime(mime) || normalizeMime(mime) === "video/webm";
}

export function areMimesCompatible(sniffed: string, declared: string): boolean {
  const sniff = normalizeMime(sniffed);
  const decl = normalizeDeclared(declared);

  if (sniff === decl) return true;
  if (equivalentPair(sniff, decl)) return true;

  if (decl === "text/csv" && sniff === "text/plain") return true;

  if (sniff === "application/zip" && ZIP_BASED_OFFICE_MIMES.has(decl)) return true;
  if (sniff === "application/x-cfb" && ZIP_BASED_OFFICE_MIMES.has(decl)) return true;

  // WebM voice notes / MediaRecorder: browser may send audio/webm, sniffer returns video/webm
  if (isAudioFamily(sniff) && isAudioFamily(decl)) return true;

  // Renamed/wrong extension common for images (e.g. hospital.jpg that is actually WebP)
  if (isImageMime(sniff) && isImageMime(decl)) return true;

  if (isVideoMime(sniff) && isVideoMime(decl)) return true;

  return false;
}

/**
 * Pick the MIME to store after sniffing. Prefers declared when compatible; otherwise sniffed
 * when it is on the allowlist (e.g. browser sent a legacy alias).
 */
export function resolveUploadMime(
  sniffed: string | undefined,
  declared: string,
): { mime: string; compatible: boolean } {
  const declaredNorm = normalizeDeclared(declared);

  if (!sniffed) {
    return { mime: declaredNorm, compatible: true };
  }

  const sniffNorm = normalizeMime(sniffed);

  if (areMimesCompatible(sniffNorm, declaredNorm)) {
    // Prefer sniffed type when labels differ but same safe family (correct Content-Type on serve)
    const sameImage = isImageMime(sniffNorm) && isImageMime(declaredNorm) && sniffNorm !== declaredNorm;
    const sameAudio = isAudioFamily(sniffNorm) && isAudioFamily(declaredNorm) && sniffNorm !== declaredNorm;
    const sameVideo = isVideoMime(sniffNorm) && isVideoMime(declaredNorm) && sniffNorm !== declaredNorm;
    const mime = sameImage || sameAudio || sameVideo ? sniffNorm : declaredNorm;
    return { mime, compatible: true };
  }

  return { mime: declaredNorm, compatible: false };
}
