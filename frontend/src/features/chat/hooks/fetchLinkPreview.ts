import api from '../../../api/axios';
import type { LinkPreviewMeta } from '../types';
import { instantPreviewFromUrl } from '../utils/linkPreviewUtils';
import { linkPreviewQueryKey } from './useLinkPreview';

export async function fetchLinkPreviewFromApi(
  url: string,
): Promise<{ preview: LinkPreviewMeta | null }> {
  const response = await api.get<{ preview: LinkPreviewMeta | null }>('/chats/link-preview', {
    params: { url },
  });
  return response.data;
}

/** Never returns null preview — keeps composer chip visible while OG fetch runs or fails. */
export async function fetchLinkPreviewWithFallback(
  url: string,
): Promise<{ preview: LinkPreviewMeta }> {
  try {
    const result = await fetchLinkPreviewFromApi(url);
    return { preview: result.preview ?? instantPreviewFromUrl(url) };
  } catch {
    return { preview: instantPreviewFromUrl(url) };
  }
}

/** Prefer cached/prefetched OG data; fall back to instant shell — never block send long. */
export async function resolveLinkPreviewForSend(
  url: string,
  queryClient?: {
    getQueryData: <T>(key: readonly unknown[]) => T | undefined;
  },
  maxMs = 200,
): Promise<LinkPreviewMeta | null> {
  const cached = queryClient?.getQueryData<{ preview: LinkPreviewMeta | null }>(
    linkPreviewQueryKey(url),
  );
  if (cached?.preview?.title && cached.preview.title !== instantPreviewFromUrl(url).title) {
    return cached.preview;
  }
  if (cached?.preview) return cached.preview;

  try {
    const result = await Promise.race([
      fetchLinkPreviewFromApi(url),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), maxMs)),
    ]);
    return result?.preview ?? instantPreviewFromUrl(url);
  } catch {
    return instantPreviewFromUrl(url);
  }
}
