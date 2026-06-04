import type { LinkDisplayMode, LinkPreviewMeta } from '../types';
import { extractFirstHttpUrl } from '../../../../shared/http-url.ts';

export { extractFirstHttpUrl } from '../../../../shared/http-url.ts';

export function linkDisplayMode(preview: LinkPreviewMeta): LinkDisplayMode {
  return preview.displayAs ?? 'inline';
}

export function faviconUrlForLink(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch {
    return '';
  }
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replaceAll(/^www\./g, '');
  } catch {
    return url;
  }
}

/** Label before bold site name in inline chip (e.g. "Google Sheet"). */
export function inlineLinkTypeLabel(preview: LinkPreviewMeta): string {
  if (preview.title?.trim()) {
    const t = preview.title.trim();
    if (t.length <= 48) return t;
    return `${t.slice(0, 45)}…`;
  }
  return 'Link';
}

export function inlineSiteLabel(preview: LinkPreviewMeta): string {
  return preview.siteName?.trim() || hostnameFromUrl(preview.url);
}

function normalizeUrlForCompare(u: string): string {
  return u.trim().replaceAll(/\/$/g, '');
}

/** Hide raw URL in message body when showing inline/preview chip for URL-only messages. */
export function messageTextWithoutLink(
  ciphertext: string | null | undefined,
  previewUrl: string,
): string {
  if (!ciphertext?.trim()) return '';
  const trimmed = ciphertext.trim();
  const urlNorm = normalizeUrlForCompare(previewUrl);
  if (normalizeUrlForCompare(trimmed) === urlNorm) return '';
  const extracted = extractFirstHttpUrl(trimmed);
  if (extracted && normalizeUrlForCompare(extracted) === urlNorm && trimmed === extracted) {
    return '';
  }
  let result = trimmed.replaceAll(previewUrl, '');
  if (extracted) result = result.replaceAll(extracted, '');
  return result.trim();
}

export function withLinkDisplay(
  preview: LinkPreviewMeta,
  displayAs: LinkDisplayMode,
): LinkPreviewMeta {
  return { ...preview, displayAs };
}

export function resolveComposerLinkPreview(
  previewDismissed: boolean,
  fetchedPreview: LinkPreviewMeta | null | undefined,
  urlInText: string | null,
): LinkPreviewMeta | null {
  if (previewDismissed) return null;
  if (fetchedPreview) return fetchedPreview;
  if (urlInText) return instantPreviewFromUrl(urlInText);
  return null;
}

/** Synchronous preview from URL only — no network; shown immediately on paste/type. */
export function instantPreviewFromUrl(url: string): LinkPreviewMeta {
  const host = hostnameFromUrl(url);
  const lower = url.toLowerCase();

  let title = host;
  let siteName = host;

  if (lower.includes('docs.google.com/spreadsheets')) {
    title = 'Google Sheet';
    siteName = 'Google Drive';
  } else if (lower.includes('docs.google.com/document')) {
    title = 'Google Doc';
    siteName = 'Google Drive';
  } else if (lower.includes('docs.google.com/presentation')) {
    title = 'Google Slides';
    siteName = 'Google Drive';
  } else if (lower.includes('drive.google.com')) {
    title = 'Google Drive';
    siteName = 'Google Drive';
  } else if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    title = 'YouTube';
    siteName = 'YouTube';
  } else if (lower.includes('github.com')) {
    title = 'GitHub';
    siteName = 'GitHub';
  } else if (lower.includes('linkedin.com')) {
    title = 'LinkedIn';
    siteName = 'LinkedIn';
  } else if (lower.includes('twitter.com') || lower.includes('x.com')) {
    title = 'X';
    siteName = 'X';
  } else {
    const parts = host.split('.');
    if (parts.length >= 2) {
      siteName = parts.slice(-2).join('.');
      const segment = parts.at(-2);
      if (segment) {
        title = segment.charAt(0).toUpperCase() + segment.slice(1);
      }
    }
  }

  return {
    url,
    title,
    siteName,
    displayAs: 'inline',
  };
}
