import { scrollDebug, scrollMetrics } from '../utils/scrollDebug';

export function schedulePendingScrollHighlight(
  messageId: string,
  onFlashHighlight: (id: string) => void,
  onNavigateDone: () => void,
): void {
  globalThis.setTimeout(() => {
    onFlashHighlight(messageId);
    globalThis.setTimeout(onNavigateDone, 2100);
  }, 400);
}

export function applyScrollToBottom(
  scrollEl: HTMLDivElement,
  bottomAnchor: HTMLDivElement | null,
  smooth: boolean,
): boolean {
  if (smooth) {
    if (bottomAnchor) {
      bottomAnchor.scrollIntoView({ block: 'end', behavior: 'smooth' });
    } else {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    }
  } else {
    scrollEl.scrollTop = scrollEl.scrollHeight;
    if (bottomAnchor) {
      bottomAnchor.scrollIntoView({ block: 'end', behavior: 'auto' });
    }
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }
  const gap = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
  return gap < 120;
}

export function scrollToUnreadAnchorElement(
  container: HTMLDivElement,
  messageId: string,
  attempt: number,
): boolean {
  const divider = document.getElementById('unread-divider');
  const messageEl = document.getElementById(`msg-${messageId}`);
  const el = divider ?? messageEl;
  if (!el) {
    scrollDebug('scrollToUnreadAnchor FAIL', {
      messageId,
      hasContainer: true,
      hasDivider: Boolean(divider),
      hasMessageEl: Boolean(messageEl),
      attempt,
    });
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (containerRect.height === 0 || elRect.height === 0) {
    scrollDebug('scrollToUnreadAnchor FAIL zero-size', {
      messageId,
      containerH: containerRect.height,
      elH: elRect.height,
      usedDivider: Boolean(divider),
      attempt,
    });
    return false;
  }

  if (divider) {
    divider.scrollIntoView({ block: 'start', behavior: 'instant' });
  } else {
    const topInset = 72;
    const offset = elRect.top - containerRect.top - topInset;
    container.scrollTo({
      top: Math.max(0, container.scrollTop + offset),
      behavior: 'instant',
    });
  }
  scrollDebug('scrollToUnreadAnchor OK', {
    messageId,
    usedDivider: Boolean(divider),
    attempt,
    ...scrollMetrics(container),
  });
  return true;
}

export function scrollMessageIntoViewCentered(
  container: HTMLDivElement,
  messageId: string,
): boolean {
  const el = document.getElementById(`msg-${messageId}`);
  if (!el) return false;

  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (containerRect.height === 0 || elRect.height === 0) return false;

  const offset =
    elRect.top - containerRect.top - container.clientHeight / 2 + elRect.height / 2;
  container.scrollTo({
    top: Math.max(0, container.scrollTop + offset),
    behavior: 'smooth',
  });
  return true;
}

export type PendingMessageScrollCallbacks = {
  onFinish: () => void;
  onGiveUp: () => void;
};

export function startPendingMessageScroll(
  scrollIntoView: (messageId: string) => boolean,
  messageId: string,
  callbacks: PendingMessageScrollCallbacks,
): () => void {
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let attempts = 0;
  let cancelled = false;

  const finishScroll = () => {
    if (cancelled) return;
    callbacks.onFinish();
    if (retryTimer) clearInterval(retryTimer);
  };

  const attemptScroll = () => {
    if (scrollIntoView(messageId)) {
      finishScroll();
      return true;
    }
    return false;
  };

  const startScroll = () => {
    if (cancelled) return;
    if (attemptScroll()) return;
    retryTimer = setInterval(() => {
      attempts += 1;
      if (attemptScroll() || attempts >= 15) {
        if (retryTimer) clearInterval(retryTimer);
        if (attempts >= 15) callbacks.onGiveUp();
      }
    }, 120);
  };

  const raf = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      globalThis.setTimeout(startScroll, 50);
    });
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    if (retryTimer) clearInterval(retryTimer);
  };
}

export function startUnreadAnchorRetryLoop(
  tryScroll: () => boolean,
  onSuccess: () => void,
  onGiveUp: () => void,
  maxAttempts = 25,
  intervalMs = 80,
): () => void {
  let attempts = 0;
  if (tryScroll()) {
    onSuccess();
    return () => {};
  }

  attempts += 1;
  const retryTimer = globalThis.setInterval(() => {
    attempts += 1;
    if (tryScroll()) {
      globalThis.clearInterval(retryTimer);
      onSuccess();
      return;
    }
    if (attempts >= maxAttempts) {
      globalThis.clearInterval(retryTimer);
      onGiveUp();
    }
  }, intervalMs);

  return () => globalThis.clearInterval(retryTimer);
}
