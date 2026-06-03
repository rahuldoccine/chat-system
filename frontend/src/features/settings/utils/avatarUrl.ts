import { env } from '../../../config/env';

const AVATAR_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export function isAvatarImageFile(file: File): boolean {
  if (!file.type.startsWith('image/')) return false;
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  return AVATAR_IMAGE_EXTENSIONS.includes(ext);
}

export function validateAvatarFile(file: File): string | null {
  if (!isAvatarImageFile(file)) {
    return `Use an image file (${AVATAR_IMAGE_EXTENSIONS.join(', ')})`;
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'Image must be 5 MB or smaller';
  }
  return null;
}

/** Extract file name for DB from upload API response (prefers storage key basename). */
export function avatarFileNameFromUpload(data: {
  key?: string;
  filename?: string;
  url: string;
}): string {
  const key = data.key?.trim() || data.filename?.trim();
  if (key) {
    const normalized = key.replaceAll('\\', '/');
    const base = normalized.split('/').pop();
    if (base) return base;
  }
  const filePathRe = /\/files\/([^?#]+)/;
  const match = filePathRe.exec(data.url);
  if (match?.[1]) {
    try {
      const decoded = decodeURIComponent(match[1]);
      const base = decoded.split('/').pop();
      if (base) return base;
    } catch {
      const base = match[1].split('/').pop();
      if (base) return base;
    }
  }
  return '';
}

/**
 * Resolve avatar value from API (path or legacy URL) to absolute URL for <img src>.
 * API returns `/api/v1/files/logos/<fileName>`; DB stores only `<fileName>`.
 */
export function resolveAvatarAbsoluteUrl(
  avatarUrl: string | null | undefined,
): string | null {
  if (!avatarUrl?.trim()) return null;
  const v = avatarUrl.trim();

  if (v.startsWith('http://') || v.startsWith('https://')) {
    return v;
  }

  if (v.startsWith('/api/') || v.startsWith('/files/')) {
    const path = v.startsWith('/') ? v : `/${v}`;
    return `${env.apiOrigin}${path}`;
  }

  if (v.includes('/files/')) {
    const pathPart = v.startsWith('/') ? v : `/${v}`;
    return `${env.apiOrigin}${pathPart}`;
  }

  const fileName = v.replaceAll('\\', '/').split('/').pop() ?? v;
  return `${env.apiOrigin}/api/v1/files/logos/${encodeURIComponent(fileName)}`;
}

/** Prefer signed-in user's live avatar when viewing their own profile. */
export function resolveLiveAvatarUrl(
  userId: string | undefined,
  signedInUserId: string | undefined,
  signedInAvatar: string | null | undefined,
  avatarUrl: string | null | undefined,
): string | null | undefined {
  if (userId && signedInUserId === userId) {
    return signedInAvatar ?? avatarUrl;
  }
  return avatarUrl;
}

/** Build a URL suitable for <img src> (adds access token for protected /files routes). */
export function getAvatarImageSrc(
  avatarUrl: string | null | undefined,
  accessToken: string | null,
): string | null {
  const absolute = resolveAvatarAbsoluteUrl(avatarUrl);
  if (!absolute) return null;

  if (!accessToken || !absolute.includes('/files/')) {
    return absolute;
  }

  try {
    const url = new URL(absolute);
    url.searchParams.set('token', accessToken);
    return url.toString();
  } catch {
    return absolute;
  }
}
