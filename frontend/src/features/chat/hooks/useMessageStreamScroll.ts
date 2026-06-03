import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildMessageStreamItems } from '../utils/messageStreamItems';
import type { QueryClient } from '@tanstack/react-query';
import {
  applyChatReadToCaches,
  applyUnreadStateToCaches,
  markChatAsReadWithRetry,
  markMessagesAsRead,
  shouldMarkChatAsRead,
} from '../utils/messageReceipts';
import {
  buildUnreadState,
  getVisibleUnreadMessageIds,
} from '../utils/incrementalRead';
import { areMessageIdsLoaded } from '../utils/messageQueryCache';
import { scrollDebug, scrollMetrics } from '../utils/scrollDebug';
import {
  applyScrollToBottom,
  scrollMessageIntoViewCentered,
  scrollToUnreadAnchorElement,
  startPendingMessageScroll,
  startUnreadAnchorRetryLoop,
  schedulePendingScrollHighlight,
} from './useMessageStreamScroll.helpers';
import type { Message } from '../types';

export type UnreadDividerState = {
  count: number;
  beforeMessageId: string;
} | null;

export type UseMessageStreamScrollParams = {
  activeId: string | null;
  chatFocusKey: number;
  activeSection: string;
  messages: Message[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isFetched: boolean;
  hasNextPage: boolean | undefined;
  fetchNextPage: () => Promise<unknown>;
  userId: string | undefined;
  queryClient: QueryClient;
  registerScrollToBottom: (fn: (() => void) | null) => void;
  pendingScrollToMessageId: string | null;
  clearPendingScrollToMessage: () => void;
  sidebarUnreadCount: number;
  unreadBoundary:
    | {
        count?: number;
        firstMessageId?: string | null;
        messageIds?: string[];
      }
    | undefined;
  isUnreadBoundaryFetched: boolean;
  isUnreadFetching: boolean;
  isPeerTyping: boolean;
  lastMessageBody: string;
  lastMessageLinkKey: string;
  onFlashHighlight: (messageId: string) => void;
  onShowToast: (msg: string) => void;
};

export function useMessageStreamScroll({
  activeId,
  chatFocusKey,
  activeSection,
  messages,
  isLoading,
  isFetching,
  isFetchingNextPage,
  isFetched,
  hasNextPage,
  fetchNextPage,
  userId,
  queryClient,
  registerScrollToBottom,
  pendingScrollToMessageId,
  clearPendingScrollToMessage,
  sidebarUnreadCount,
  unreadBoundary,
  isUnreadBoundaryFetched,
  isUnreadFetching,
  isPeerTyping,
  lastMessageBody,
  lastMessageLinkKey,
  onFlashHighlight,
  onShowToast,
}: UseMessageStreamScrollParams) {
  const [unreadDivider, setUnreadDivider] = useState<UnreadDividerState>(null);
  const unreadDividerRef = useRef(unreadDivider);
  unreadDividerRef.current = unreadDivider;

  const initialScrollDoneRef = useRef(false);
  const markedReadAtBottomRef = useRef<string | null>(null);
  const initialUnreadSnapshotRef = useRef<{
    chatId: string;
    count: number;
    firstMessageId: string | null;
    messageIds: string[];
  } | null>(null);
  const initialScrollPhaseRef = useRef<
    'idle' | 'loading-history' | 'scrolling-to-unread' | 'done'
  >('idle');
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const unreadScrollAttemptsRef = useRef(0);
  const unreadMessageIdsRef = useRef<Set<string>>(new Set());
  const unreadChronologicalOrderRef = useRef<string[]>([]);
  const locallyMarkedReadRef = useRef<Set<string>>(new Set());
  const pendingVisibleMarkRef = useRef<Set<string>>(new Set());
  const markFlushTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const readTrackingEnabledRef = useRef(false);

  const [suppressBottomSpacer, setSuppressBottomSpacer] = useState(false);
  const hasActiveUnreadDivider = Boolean(unreadDivider && unreadDivider.count > 0);
  const hasPendingUnreads = hasActiveUnreadDivider || suppressBottomSpacer;
  const didResetScrollForUnreadRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const pendingFocusScrollRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const followBottomRef = useRef(true);
  const allowBottomPinRef = useRef(true);
  const navigatingToMessageRef = useRef(false);
  const [newBelowCount, setNewBelowCount] = useState(0);
  const wasPeerTypingRef = useRef(false);

  const streamItemsLength = useMemo(
    () =>
      messages?.length
        ? buildMessageStreamItems(messages, unreadDivider, unreadMessageIdsRef.current).length
        : 0,
    [messages, unreadDivider],
  );

  const scrollToBottom = useCallback((smooth = false, force = false) => {
    if (!force && !allowBottomPinRef.current) {
      scrollDebug('scrollToBottom BLOCKED', {
        smooth,
        force,
        allowBottomPin: allowBottomPinRef.current,
        phase: initialScrollPhaseRef.current,
        ...scrollMetrics(scrollRef.current),
      });
      return;
    }

    if (force || followBottomRef.current) {
      followBottomRef.current = true;
      stickToBottomRef.current = true;
    }

    scrollDebug('scrollToBottom', {
      smooth,
      force,
      allowBottomPin: allowBottomPinRef.current,
      stickToBottom: stickToBottomRef.current,
      followBottom: followBottomRef.current,
      phase: initialScrollPhaseRef.current,
      initialScrollDone: initialScrollDoneRef.current,
    });

    const apply = () => {
      const el = scrollRef.current;
      if (!el) return;
      const nearBottom = applyScrollToBottom(el, bottomAnchorRef.current, smooth);
      if (nearBottom) {
        stickToBottomRef.current = true;
        followBottomRef.current = true;
      }
      scrollDebug('scrollToBottom applied', scrollMetrics(el));
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(apply);
      });
    });
  }, []);

  const pinToBottom = useCallback(() => {
    allowBottomPinRef.current = true;
    followBottomRef.current = true;
    stickToBottomRef.current = true;
    setNewBelowCount(0);
    scrollToBottom(false, true);
  }, [scrollToBottom]);

  const jumpToLatest = useCallback(() => {
    allowBottomPinRef.current = true;
    followBottomRef.current = true;
    stickToBottomRef.current = true;
    setNewBelowCount(0);
    scrollToBottom(true, true);
  }, [scrollToBottom]);

  const fetchOlderMessages = useCallback(() => {
    const el = scrollRef.current;
    if (el) pendingScrollRestoreRef.current = el.scrollHeight;
    void fetchNextPage();
  }, [fetchNextPage]);

  useEffect(() => {
    registerScrollToBottom(pinToBottom);
    return () => registerScrollToBottom(null);
  }, [registerScrollToBottom, pinToBottom]);

  const scrollToUnreadAnchor = useCallback((messageId: string): boolean => {
    const container = scrollRef.current;
    if (!container) return false;
    return scrollToUnreadAnchorElement(
      container,
      messageId,
      unreadScrollAttemptsRef.current,
    );
  }, []);

  const applyLocalUnreadState = useCallback(
    (chatId: string, messageIds: string[]) => {
      const order = unreadChronologicalOrderRef.current;
      const unread = buildUnreadState(messageIds, order);
      const sorted = unread.messageIds ?? [];
      unreadMessageIdsRef.current = new Set(sorted);
      applyUnreadStateToCaches(queryClient, chatId, unread);
      setUnreadDivider(
        unread.count > 0 && unread.firstMessageId
          ? { count: unread.count, beforeMessageId: unread.firstMessageId }
          : null,
      );
      if (unread.count === 0) {
        markedReadAtBottomRef.current = chatId;
        allowBottomPinRef.current = true;
        setSuppressBottomSpacer(false);
      }
    },
    [queryClient],
  );

  const flushVisibleUnreadMarks = useCallback(
    async (chatId: string) => {
      const batch = [...pendingVisibleMarkRef.current];
      pendingVisibleMarkRef.current.clear();
      if (batch.length === 0) return;

      for (const id of batch) {
        locallyMarkedReadRef.current.add(id);
        unreadMessageIdsRef.current.delete(id);
      }

      const remaining = [...unreadMessageIdsRef.current];
      applyLocalUnreadState(chatId, remaining);

      const result = await markMessagesAsRead(chatId, batch);
      if (result?.unread) {
        applyLocalUnreadState(chatId, result.unread.messageIds ?? []);
      } else if (remaining.length > 0) {
        for (const id of batch) {
          locallyMarkedReadRef.current.delete(id);
          unreadMessageIdsRef.current.add(id);
        }
        applyLocalUnreadState(chatId, [...unreadMessageIdsRef.current]);
      }
    },
    [applyLocalUnreadState],
  );

  const scheduleVisibleUnreadFlush = useCallback(
    (chatId: string) => {
      if (markFlushTimerRef.current) clearTimeout(markFlushTimerRef.current);
      markFlushTimerRef.current = globalThis.setTimeout(() => {
        markFlushTimerRef.current = null;
        void flushVisibleUnreadMarks(chatId);
      }, 280);
    },
    [flushVisibleUnreadMarks],
  );

  const scanAndQueueVisibleUnread = useCallback(
    (chatId: string) => {
      if (!readTrackingEnabledRef.current || !userId) return;

      const visible = getVisibleUnreadMessageIds(
        scrollRef.current,
        messages,
        userId,
        unreadMessageIdsRef.current,
        locallyMarkedReadRef.current,
      );

      let queued = false;
      for (const id of visible) {
        if (pendingVisibleMarkRef.current.has(id)) continue;
        pendingVisibleMarkRef.current.add(id);
        queued = true;
      }
      if (queued) scheduleVisibleUnreadFlush(chatId);
    },
    [messages, userId, scheduleVisibleUnreadFlush],
  );

  const tryMarkReadIfCaughtUp = useCallback(
    (chatId: string) => {
      if (!isFetched || isFetching || !readTrackingEnabledRef.current) return;

      const pendingUnread = [...unreadMessageIdsRef.current];

      if (pendingUnread.length > 0) {
        scanAndQueueVisibleUnread(chatId);
        return;
      }

      const lastId = messages?.length ? messages.at(-1)?.id : null;
      if (!shouldMarkChatAsRead(scrollRef.current, lastId)) return;
      if (markedReadAtBottomRef.current === chatId) return;

      void markChatAsReadWithRetry(chatId).then((ok) => {
        if (!ok) return;
        markedReadAtBottomRef.current = chatId;
        allowBottomPinRef.current = true;
        unreadMessageIdsRef.current.clear();
        locallyMarkedReadRef.current.clear();
        pendingVisibleMarkRef.current.clear();
        applyChatReadToCaches(queryClient, chatId);
        setUnreadDivider(null);
        setSuppressBottomSpacer(false);
      });
    },
    [messages, queryClient, scanAndQueueVisibleUnread, isFetched, isFetching],
  );

  const completeInitialScroll = useCallback(
    (chatId: string, reason = 'unknown') => {
      scrollDebug('completeInitialScroll', {
        chatId: chatId.slice(0, 8),
        reason,
        snapshotCount: initialUnreadSnapshotRef.current?.count ?? 0,
        unreadAttempts: unreadScrollAttemptsRef.current,
        suppressBottomSpacer,
        hasUnreadDivider: Boolean(unreadDividerRef.current),
        allowBottomPin: allowBottomPinRef.current,
        ...scrollMetrics(scrollRef.current),
      });
      initialScrollDoneRef.current = true;
      initialScrollPhaseRef.current = 'done';
      readTrackingEnabledRef.current = true;
      pendingFocusScrollRef.current = false;
      unreadScrollAttemptsRef.current = 0;
      if (messages?.length) {
        lastMessageIdRef.current = messages.at(-1)?.id ?? null;
      }
    },
    [messages, suppressBottomSpacer],
  );

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (initialScrollPhaseRef.current !== 'done') return;
      if (followBottomRef.current && allowBottomPinRef.current) {
        scrollToBottom(false);
      }
      if (activeId && initialScrollDoneRef.current && readTrackingEnabledRef.current) {
        tryMarkReadIfCaughtUp(activeId);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeId, scrollToBottom, tryMarkReadIfCaughtUp]);

  useEffect(() => {
    const opensWithUnread = Boolean(activeId && sidebarUnreadCount > 0);
    pendingFocusScrollRef.current = true;
    initialScrollDoneRef.current = false;
    readTrackingEnabledRef.current = false;
    allowBottomPinRef.current = !opensWithUnread;
    stickToBottomRef.current = !opensWithUnread;
    followBottomRef.current = !opensWithUnread;
    setSuppressBottomSpacer(opensWithUnread);
    didResetScrollForUnreadRef.current = false;
    initialScrollPhaseRef.current = 'idle';
    initialUnreadSnapshotRef.current = null;
    unreadScrollAttemptsRef.current = 0;
    pendingScrollRestoreRef.current = null;
    unreadMessageIdsRef.current = new Set();
    unreadChronologicalOrderRef.current = [];
    locallyMarkedReadRef.current = new Set();
    pendingVisibleMarkRef.current = new Set();
    if (markFlushTimerRef.current) {
      clearTimeout(markFlushTimerRef.current);
      markFlushTimerRef.current = null;
    }
    lastMessageIdRef.current = null;
    setNewBelowCount(0);
    setUnreadDivider(null);
    markedReadAtBottomRef.current = null;
    if (activeId) {
      void queryClient.invalidateQueries({ queryKey: ['chatUnread', activeId] });
    }
    scrollDebug('RESET chat open', {
      chatId: activeId?.slice(0, 8) ?? null,
      chatFocusKey,
      sidebarUnreadCount,
      opensWithUnread,
      allowBottomPin: allowBottomPinRef.current,
    });
  }, [activeId, chatFocusKey, queryClient, sidebarUnreadCount]);

  useEffect(() => {
    if (!activeId || initialScrollDoneRef.current || sidebarUnreadCount <= 0) return;
    allowBottomPinRef.current = false;
    stickToBottomRef.current = false;
    setSuppressBottomSpacer(true);
    scrollDebug('sidebar unread → suppress spacer', {
      chatId: activeId.slice(0, 8),
      sidebarUnreadCount,
    });
  }, [activeId, sidebarUnreadCount]);

  useEffect(() => {
    if (!activeId || !isUnreadBoundaryFetched || isUnreadFetching) return;
    if (initialUnreadSnapshotRef.current?.chatId === activeId) return;

    const apiCount = unreadBoundary?.count ?? 0;
    if (apiCount === 0 && sidebarUnreadCount > 0) {
      scrollDebug('snapshot WAIT refetch (api=0, sidebar>0)', {
        chatId: activeId.slice(0, 8),
        sidebarUnreadCount,
      });
      void queryClient.invalidateQueries({ queryKey: ['chatUnread', activeId] });
      return;
    }

    const messageIds = unreadBoundary?.messageIds ?? [];
    const count = unreadBoundary?.count ?? 0;
    const firstMessageId = unreadBoundary?.firstMessageId ?? null;
    initialUnreadSnapshotRef.current = {
      chatId: activeId,
      count,
      firstMessageId,
      messageIds,
    };
    unreadMessageIdsRef.current = new Set(messageIds);
    unreadChronologicalOrderRef.current = messageIds;

    scrollDebug('snapshot CAPTURED', {
      chatId: activeId.slice(0, 8),
      count,
      firstMessageId: firstMessageId?.slice(0, 8) ?? null,
      messageIdsLen: messageIds.length,
      sidebarUnreadCount,
    });

    if (count > 0 && firstMessageId) {
      allowBottomPinRef.current = false;
      stickToBottomRef.current = false;
      setSuppressBottomSpacer(true);
      setUnreadDivider({ count, beforeMessageId: firstMessageId });
    }
  }, [
    activeId,
    isUnreadBoundaryFetched,
    isUnreadFetching,
    unreadBoundary,
    sidebarUnreadCount,
    queryClient,
  ]);

  useEffect(() => {
    if (!activeId || isLoading || isFetchingNextPage) return;
    const pending = [...unreadMessageIdsRef.current];
    if (pending.length === 0) return;
    if (areMessageIdsLoaded(messages, pending)) return;
    scrollDebug('fetchOlder for unread ids', {
      chatId: activeId.slice(0, 8),
      pendingUnread: pending.length,
      messagesLoaded: messages?.length ?? 0,
    });
    if (hasNextPage) fetchOlderMessages();
  }, [
    activeId,
    messages,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    fetchOlderMessages,
    unreadDivider?.count,
  ]);

  useEffect(() => {
    if (!activeId || isLoading || hasNextPage) return;
    const loadedIds = new Set((messages ?? []).map((m) => m.id));
    const orphans = [...unreadMessageIdsRef.current].filter((id) => !loadedIds.has(id));
    if (orphans.length === 0) return;

    for (const id of orphans) {
      unreadMessageIdsRef.current.delete(id);
    }
    applyLocalUnreadState(activeId, [...unreadMessageIdsRef.current]);
    void markMessagesAsRead(activeId, orphans);
  }, [activeId, messages, hasNextPage, isLoading, applyLocalUnreadState]);

  useLayoutEffect(() => {
    const prevHeight = pendingScrollRestoreRef.current;
    if (prevHeight == null) return;
    const el = scrollRef.current;
    if (!el) return;
    pendingScrollRestoreRef.current = null;
    const delta = el.scrollHeight - prevHeight;
    el.scrollTop += delta;
    scrollDebug('scroll restore (older prepended)', {
      delta: Math.round(delta),
      ...scrollMetrics(el),
    });
  }, [messages?.length, isFetchingNextPage]);

  useEffect(() => {
    if (!activeId || isLoading || isFetching || isUnreadFetching || !pendingFocusScrollRef.current) {
      return;
    }
    if (initialScrollPhaseRef.current !== 'idle') return;
    if (pendingScrollToMessageId || navigatingToMessageRef.current) {
      pendingFocusScrollRef.current = false;
      initialScrollDoneRef.current = true;
      initialScrollPhaseRef.current = 'done';
      return;
    }
    if (!isUnreadBoundaryFetched || !initialUnreadSnapshotRef.current) return;

    const snapshot = initialUnreadSnapshotRef.current;
    const hasUnread = snapshot.count > 0 && Boolean(snapshot.firstMessageId);

    if (!hasUnread) {
      scrollDebug('initial scroll → bottom (no unreads)', {
        chatId: activeId.slice(0, 8),
        snapshotCount: snapshot.count,
      });
      initialScrollPhaseRef.current = 'done';
      setSuppressBottomSpacer(false);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          allowBottomPinRef.current = true;
          followBottomRef.current = true;
          stickToBottomRef.current = true;
          setNewBelowCount(0);
          scrollToBottom(false);
          completeInitialScroll(activeId, 'no-unreads');
        });
      });
      return () => cancelAnimationFrame(raf);
    }

    const firstId = snapshot.firstMessageId;
    if (!firstId) return;
    setUnreadDivider({ count: snapshot.count, beforeMessageId: firstId });
    stickToBottomRef.current = false;
    followBottomRef.current = false;
    allowBottomPinRef.current = false;

    const inList = messages?.some((m) => m.id === firstId) ?? false;
    if (!inList) {
      scrollDebug('initial scroll → loading-history', {
        chatId: activeId.slice(0, 8),
        firstId: firstId.slice(0, 8),
        messagesLoaded: messages?.length ?? 0,
        hasNextPage,
      });
      initialScrollPhaseRef.current = 'loading-history';
      if (hasNextPage && !isFetchingNextPage) fetchOlderMessages();
      return;
    }

    scrollDebug('initial scroll → scrolling-to-unread', {
      chatId: activeId.slice(0, 8),
      firstId: firstId.slice(0, 8),
      unreadCount: snapshot.count,
      messagesLoaded: messages?.length ?? 0,
    });
    initialScrollPhaseRef.current = 'scrolling-to-unread';
  }, [
    activeId,
    chatFocusKey,
    isLoading,
    isFetching,
    isUnreadFetching,
    isUnreadBoundaryFetched,
    messages,
    hasNextPage,
    isFetchingNextPage,
    fetchOlderMessages,
    scrollToBottom,
    completeInitialScroll,
    pendingScrollToMessageId,
  ]);

  useLayoutEffect(() => {
    if (!activeId || initialScrollPhaseRef.current === 'done') return;

    const snapshot = initialUnreadSnapshotRef.current;
    if (snapshot?.chatId !== activeId) return;

    const firstId = snapshot.firstMessageId;
    if (!firstId || snapshot.count === 0) return;

    const inList = messages?.some((m) => m.id === firstId) ?? false;
    if (!inList) {
      if (initialScrollPhaseRef.current !== 'loading-history') {
        initialScrollPhaseRef.current = 'loading-history';
      }
      if (hasNextPage && !isFetchingNextPage) fetchOlderMessages();
      return;
    }

    if (initialScrollPhaseRef.current === 'loading-history') {
      initialScrollPhaseRef.current = 'scrolling-to-unread';
    }
    if (initialScrollPhaseRef.current !== 'scrolling-to-unread') return;

    const container = scrollRef.current;
    if (container && !didResetScrollForUnreadRef.current) {
      didResetScrollForUnreadRef.current = true;
      container.scrollTop = 0;
      scrollDebug('reset scrollTop=0 before unread anchor', scrollMetrics(container));
    }

    const tryScroll = () => {
      if (!scrollToUnreadAnchor(firstId)) return false;
      stickToBottomRef.current = false;
      allowBottomPinRef.current = false;
      completeInitialScroll(activeId, 'unread-anchor-ok');
      return true;
    };

    if (tryScroll()) return;

    unreadScrollAttemptsRef.current += 1;
    if (unreadScrollAttemptsRef.current >= 25) {
      scrollDebug('unread scroll GAVE UP (max attempts)', {
        chatId: activeId.slice(0, 8),
        firstId: firstId.slice(0, 8),
        streamItemsLen: streamItemsLength,
        hasDividerEl: Boolean(document.getElementById('unread-divider')),
      });
      completeInitialScroll(activeId, 'unread-anchor-timeout');
      return;
    }

    scrollDebug('unread scroll retry scheduled', {
      chatId: activeId.slice(0, 8),
      attempt: unreadScrollAttemptsRef.current,
      phase: initialScrollPhaseRef.current,
      streamItemsLen: streamItemsLength,
    });

    return startUnreadAnchorRetryLoop(
      () => {
        unreadScrollAttemptsRef.current += 1;
        if (!scrollToUnreadAnchor(firstId)) return false;
        stickToBottomRef.current = false;
        allowBottomPinRef.current = false;
        completeInitialScroll(activeId, 'unread-anchor-ok');
        return true;
      },
      () => {},
      () => {
        if (initialScrollDoneRef.current) return;
        scrollDebug('unread scroll retry ended', {
          chatId: activeId.slice(0, 8),
          attempts: unreadScrollAttemptsRef.current,
        });
        completeInitialScroll(activeId, 'unread-anchor-retry-end');
      },
    );
  }, [
    activeId,
    messages,
    streamItemsLength,
    unreadDivider,
    hasNextPage,
    isFetchingNextPage,
    fetchOlderMessages,
    scrollToUnreadAnchor,
    completeInitialScroll,
  ]);

  useEffect(() => {
    if (!activeId || !userId || !readTrackingEnabledRef.current) return;

    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let queued = false;
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.55) continue;
          const id = entry.target.id.replaceAll(/^msg-/, '');
          if (!id || !unreadMessageIdsRef.current.has(id)) continue;
          if (locallyMarkedReadRef.current.has(id) || pendingVisibleMarkRef.current.has(id)) {
            continue;
          }
          pendingVisibleMarkRef.current.add(id);
          queued = true;
        }
        if (queued) scheduleVisibleUnreadFlush(activeId);
      },
      { root: container, threshold: [0.55, 0.85] },
    );

    for (const msg of messages ?? []) {
      if (msg.senderId === userId || msg.deletedAt) continue;
      if (!unreadMessageIdsRef.current.has(msg.id)) continue;
      if (locallyMarkedReadRef.current.has(msg.id)) continue;
      const el = document.getElementById(`msg-${msg.id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [activeId, userId, messages, unreadDivider?.count, scheduleVisibleUnreadFlush]);

  useLayoutEffect(() => {
    if (!activeId || isLoading || isFetchingNextPage || !messages?.length) return;
    if (pendingScrollToMessageId || navigatingToMessageRef.current) return;
    if (!initialScrollDoneRef.current) return;
    if (!allowBottomPinRef.current) return;

    const lastMessage = messages.at(-1);
    const lastId = lastMessage?.id ?? null;
    if (!lastId || lastId === lastMessageIdRef.current) return;

    lastMessageIdRef.current = lastId;

    const container = scrollRef.current;
    const isNearBottom = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight < 120
      : true;
    const sentByMe = lastMessage?.senderId === userId;

    if (sentByMe || isNearBottom) {
      scrollDebug('new message → scroll bottom', {
        lastId: lastId.slice(0, 8),
        sentByMe,
        isNearBottom,
      });
      followBottomRef.current = true;
      stickToBottomRef.current = true;
      setNewBelowCount(0);
      scrollToBottom(false);
    } else if (!sentByMe) {
      setNewBelowCount((c) => c + 1);
    }
  }, [messages, activeId, isLoading, isFetchingNextPage, userId, scrollToBottom, pendingScrollToMessageId]);

  useLayoutEffect(() => {
    if (!activeId || isLoading || isFetchingNextPage || !messages?.length) return;
    if (pendingScrollToMessageId || navigatingToMessageRef.current) return;
    if (!initialScrollDoneRef.current || !allowBottomPinRef.current) return;
    if (!followBottomRef.current) return;

    scrollDebug('latest content layout → scroll bottom', {
      bodyLen: lastMessageBody.length,
      hasLink: Boolean(lastMessageLinkKey),
    });
    scrollToBottom(false);
  }, [
    lastMessageBody,
    lastMessageLinkKey,
    activeId,
    isLoading,
    isFetchingNextPage,
    messages?.length,
    scrollToBottom,
    pendingScrollToMessageId,
  ]);

  const scrollMessageIntoView = useCallback((messageId: string): boolean => {
    const container = scrollRef.current;
    if (!container) return false;
    return scrollMessageIntoViewCentered(container, messageId);
  }, []);

  useEffect(() => {
    if (!pendingScrollToMessageId || isLoading || activeSection !== 'messages') return;

    const messageId = pendingScrollToMessageId;
    navigatingToMessageRef.current = true;
    stickToBottomRef.current = false;
    pendingFocusScrollRef.current = false;

    const inList = messages?.some((m) => m.id === messageId) ?? false;

    if (!inList) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchOlderMessages();
      } else if (!hasNextPage) {
        navigatingToMessageRef.current = false;
        clearPendingScrollToMessage();
        onShowToast('Message not found in this chat');
      }
      return;
    }

    return startPendingMessageScroll(scrollMessageIntoView, messageId, {
      onFinish: () => {
        clearPendingScrollToMessage();
        schedulePendingScrollHighlight(messageId, onFlashHighlight, () => {
          navigatingToMessageRef.current = false;
        });
      },
      onGiveUp: () => {
        navigatingToMessageRef.current = false;
        clearPendingScrollToMessage();
        onShowToast("Couldn't find that message");
      },
    });
  }, [
    pendingScrollToMessageId,
    activeSection,
    isLoading,
    messages?.length,
    hasNextPage,
    isFetchingNextPage,
    fetchOlderMessages,
    scrollMessageIntoView,
    clearPendingScrollToMessage,
    onShowToast,
    onFlashHighlight,
  ]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = gap < 120;
      stickToBottomRef.current = atBottom;
      if (atBottom) {
        followBottomRef.current = true;
        setNewBelowCount(0);
        allowBottomPinRef.current = true;
      } else if (gap >= 120) {
        followBottomRef.current = false;
      }
      if (activeId && readTrackingEnabledRef.current) {
        tryMarkReadIfCaughtUp(activeId);
      }

      if (el.scrollTop === 0 && hasNextPage && !isFetchingNextPage) {
        fetchOlderMessages();
      }
    },
    [activeId, hasNextPage, isFetchingNextPage, fetchOlderMessages, tryMarkReadIfCaughtUp],
  );

  const handleMediaLoaded = useCallback(() => {
    if (followBottomRef.current && allowBottomPinRef.current) {
      scrollToBottom(false);
    }
  }, [scrollToBottom]);

  const handleLastMessageSettled = useCallback(() => {
    if (followBottomRef.current && allowBottomPinRef.current) {
      scrollToBottom(false);
    }
  }, [scrollToBottom]);

  useEffect(() => {
    if (isPeerTyping && !wasPeerTypingRef.current && followBottomRef.current) {
      scrollToBottom(false);
    }
    wasPeerTypingRef.current = isPeerTyping;
  }, [isPeerTyping, scrollToBottom]);

  const trackIncomingUnread = useCallback((message: Message, senderId: string | undefined) => {
    if (message.senderId !== senderId && !message.deletedAt) {
      unreadMessageIdsRef.current.add(message.id);
    }
  }, []);

  const isInitialScrollDone = useCallback(() => initialScrollDoneRef.current, []);

  return {
    scrollRef,
    streamRef,
    bottomAnchorRef,
    unreadDivider,
    unreadMessageIdsRef,
    hasPendingUnreads,
    newBelowCount,
    handleScroll,
    jumpToLatest,
    handleMediaLoaded,
    handleLastMessageSettled,
    fetchOlderMessages,
    trackIncomingUnread,
    isInitialScrollDone,
  };
}
