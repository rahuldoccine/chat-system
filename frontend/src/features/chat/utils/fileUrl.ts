import { env } from '../../../config/env';

export function buildFileUrl(
  contentMeta: { url?: string; filename?: string },
  token: string | null,
): string {
  let path: string | null = null;
  if (contentMeta.url?.startsWith('/')) {
    path = contentMeta.url;
  } else if (contentMeta.filename) {
    path = `${env.filesApiPath}/${contentMeta.filename}`;
  }

  if (!path) return '';
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${env.apiOrigin}${path}${query}`;
}
