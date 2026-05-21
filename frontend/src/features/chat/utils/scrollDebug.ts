import { env } from '../../../config/env';

export function scrollDebug(_event: string, data?: Record<string, unknown>): void {
  if (!env.scrollDebug) return;
  void (typeof performance !== 'undefined' ? Math.round(performance.now()) : 0);
  if (data && Object.keys(data).length > 0) {
    // console.log(`[MS:scroll] ${ts}ms | ${event}`, data);
  } else {
    // console.log(`[MS:scroll] ${ts}ms | ${event}`);
  }
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
