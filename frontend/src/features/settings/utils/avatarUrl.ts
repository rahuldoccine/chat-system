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

/** Normalize stored avatar URL to an absolute API or external URL (no auth token). */
export function toStoredAvatarUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${env.apiOrigin}${trimmed}`;
  }
  return trimmed;
}

/** Build a URL suitable for <img src> (adds access token for protected /files routes). */
export function getAvatarImageSrc(
  avatarUrl: string | null | undefined,
  accessToken: string | null,
): string | null {
  if (!avatarUrl?.trim()) return null;

  let absolute = avatarUrl.trim();
  if (absolute.startsWith('/')) {
    absolute = `${env.apiOrigin}${absolute}`;
  }

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
