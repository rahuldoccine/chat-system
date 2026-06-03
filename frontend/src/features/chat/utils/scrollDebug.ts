import { env } from '../../../config/env';

export function scrollDebug(_event: string, _data?: Record<string, unknown>): void {
  if (!env.scrollDebug) return;
  // Intentionally quiet; enable logging locally when debugging scroll.
}

export function scrollMetrics(container: HTMLElement | null) {
  if (!container) {
    return { scrollTop: null, scrollHeight: null, clientHeight: null, fromBottom: null, atBottom: null };
  }
  const { scrollTop, scrollHeight, clientHeight } = container;
  const fromBottom = scrollHeight - scrollTop - clientHeight;
  return {
    scrollTop: Math.round(scrollTop),
    scrollHeight: Math.round(scrollHeight),
    clientHeight: Math.round(clientHeight),
    fromBottom: Math.round(fromBottom),
    atBottom: fromBottom < 120,
  };
}
