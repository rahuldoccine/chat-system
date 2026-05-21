import { env } from '../../../config/env';

export function buildFileUrl(
  contentMeta: { url?: string; filename?: string },
  token: string | null,
): string {
  const path = contentMeta.url?.startsWith('/')
    ? contentMeta.url
    : contentMeta.filename
      ? `${env.filesApiPath}/${contentMeta.filename}`
      : null;

  if (!path) return '';
  return `${env.apiOrigin}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}
