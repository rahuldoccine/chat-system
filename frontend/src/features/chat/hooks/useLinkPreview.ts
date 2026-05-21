import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LinkPreviewMeta } from '../types';
import { instantPreviewFromUrl } from '../utils/linkPreviewUtils';
import { fetchLinkPreviewWithFallback } from './fetchLinkPreview';

export { extractFirstHttpUrl } from '../utils/linkPreviewUtils';

export function linkPreviewQueryKey(url: string) {
  return ['link-preview', url] as const;
}

export function useLinkPreview(url: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const prevUrlRef = useRef<string | null>(null);
  const instant = url ? instantPreviewFromUrl(url) : null;

  useEffect(() => {
    if (!enabled || !url || url === prevUrlRef.current) return;
    prevUrlRef.current = url;
    void queryClient.prefetchQuery({
      queryKey: linkPreviewQueryKey(url),
      queryFn: () => fetchLinkPreviewWithFallback(url),
      staleTime: 60_000,
    });
  }, [url, enabled, queryClient]);

  useEffect(() => {
    if (!url) prevUrlRef.current = null;
  }, [url]);

  return useQuery<{ preview: LinkPreviewMeta }>({
    queryKey: linkPreviewQueryKey(url ?? ''),
    queryFn: () => fetchLinkPreviewWithFallback(url!),
    enabled: enabled && Boolean(url),
    staleTime: 60_000,
    placeholderData: instant ? { preview: instant } : undefined,
  });
}
