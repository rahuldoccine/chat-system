import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './MessageStream.module.css';
import { motion } from 'framer-motion';
import {
  useMessages,
  useAddReaction,
  useRemoveReaction,
  useConversations,
  useDeleteMessage,
  usePinMessage,
  useUnpinMessage,
  usePinnedMessages,
  useChatUnreadBoundary,
} from '../hooks/useChatData';
import { useChat } from '../../../context/ChatContext';
import UserAvatar from './UserAvatar';
import LiveUserName from './LiveUserName';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Reply, Smile, MoreHorizontal, MessageCircle, Sparkles, ChevronDown, Pin } from 'lucide-react';
import MessageListSkeleton from './MessageListSkeleton';
import MediaAttachment from './MediaAttachment';
import MessageMeta from './MessageMeta';
import {
  ackIncomingMessages,
  applyChatReadToCaches,
  applyUnreadStateToCaches,
  markChatAsReadWithRetry,
  markMessagesAsRead,
  patchReceiptStatusInCache,
  shouldMarkChatAsRead,
} from '../utils/messageReceipts';
import {
  buildUnreadState,
  getVisibleUnreadMessageIds,
} from '../utils/incrementalRead';
import {
  areMessageIdsLoaded,
  mergeMessageIntoInfiniteCache,
} from '../utils/messageQueryCache';
import { replyPreviewAuthor, replyPreviewLabel } from '../utils/messageReply';
import { patchReactionOnMessage } from '../utils/messageReactions';
import { patchMessageInCache, removeMessageFromCache, getMessageCopyText } from '../utils/messageCache';
import MessageOptionsMenu, { type MessageMenuAction } from './MessageOptionsMenu';
import ForwardMessageModal from './ForwardMessageModal';
import ConfirmModal from './ConfirmModal';
import PollMessage from './PollMessage';
import CallMessageBubble, { getCallFromMessageMeta } from '../../calls/components/CallMessageBubble';
import CallTranscriptBubble, {
  getCallTranscriptFromMeta,
} from '../../calls/components/CallTranscriptBubble';
import GroupActivityBubble, {
  getGroupActivityFromMeta,
} from './GroupActivityBubble';
import { fetchGroup, type GroupMember } from '../api/groupsApi';
import { canModerateMessages, roleLabel } from '../utils/groupRoles';
import LinkPreviewBlock from './LinkPreviewBlock';
import { useUpdateLinkDisplay } from '../hooks/useUpdateLinkDisplay';
import { useAppSettings } from '../../settings/hooks/useUserSettings';
import { linkDisplayMode, messageTextWithoutLink } from '../utils/linkPreviewUtils';
import { useCall } from '../../calls/CallProvider';
import { retryOutboxMessage } from '../../sync/sendMessage';
import type { Message, ReplyPreview } from '../types';
import { buildMessageStreamItems, formatUnreadDividerLabel } from '../utils/messageStreamItems';
import { getMessageFiles, isVoiceMessage, shouldUseGroupedFileLayout } from '../utils/fileMeta';
import { getMessagePreviewText } from '../utils/messagePreview';
import { scrollDebug, scrollMetrics } from '../utils/scrollDebug';
import {
  useMessageBodies,
  getMessageDisplayBody,
  getMessageLinkPreview,
  getDecryptedPollMeta,
  messageWithDecryptedMeta,
} from '../../e2ee/useMessageBodies';
import TypingIndicator from './TypingIndicator';
import { useChatTyping } from '../hooks/useChatTyping';
import { HighlightedMessageText, MentionHighlightedText } from '../utils/searchHighlight';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function formatThreadLastReply(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const MessageStream: React.FC = () => {
  const {
    activeId,
    activeSection,
    chatFocusKey,
    setReplyingTo,
    setEditingMessage,
    registerScrollToBottom,
    pendingScrollToMessageId,
    clearPendingScrollToMessage,
    requestScrollToMessage,
    openThread,
    inChatSearchOpen,
    inChatSearchQuery,
    inChatSearchMatchIds,
    inChatSearchActiveIndex,
  } = useChat();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const updateLinkDisplay = useUpdateLinkDisplay();

  const handleRetryFailedMessage = useCallback(
    async (msg: Message) => {
      const clientId = msg.clientMessageId ?? msg.id;
      const result = await retryOutboxMessage(clientId);
      if (!result || result.queued) return;
      queryClient.setQueryData(['messages', result.message.chatId], (old) =>
        mergeMessageIntoInfiniteCache(
          old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
          {
            ...result.message,
            clientMessageId: result.clientMessageId,
            receiptStatus: 'sent',
            status: undefined,
          },
        ) ?? old,
      );
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    [queryClient],
  );
  const { data: conversationsResponse } = useConversations();
  const {
    data: messages,
    isLoading,
    isFetching,
    isFetched,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(activeId);

  const decryptedBodies = useMessageBodies(messages);

  const activeChat = (
    conversationsResponse as {
      data?: Array<{
        id: string;
        type: string;
        e2eeMode?: string;
        title?: string;
        dmPeer?: {
          id: string;
          displayName?: string;
          email?: string;
          avatarUrl?: string;
        };
      }>;
    }
  )?.data?.find((c) => c.id === activeId);

  const bodyOf = useCallback(
    (msg: Message) => getMessageDisplayBody(msg, decryptedBodies, user?.id ?? ''),
    [decryptedBodies, user?.id],
  );

  const searchQuery = inChatSearchOpen ? inChatSearchQuery.trim() : '';
  const activeSearchMessageId = useMemo(() => {
    if (!searchQuery || !inChatSearchMatchIds.length) return null;
    return inChatSearchMatchIds[inChatSearchActiveIndex] ?? null;
  }, [searchQuery, inChatSearchMatchIds, inChatSearchActiveIndex]);

  const isDirectChat = activeChat?.type === 'DIRECT';
  const isGroupChat = activeChat?.type === 'GROUP';
  const supportsThreads = isDirectChat || isGroupChat;
  const { data: groupDetails } = useQuery({
    queryKey: ['group', activeId],
    queryFn: () => fetchGroup(activeId!),
    enabled: Boolean(activeId && isGroupChat),
  });
  const canModerate = groupDetails ? canModerateMessages(groupDetails.myRole) : false;
  const memberRoleByUserId = useMemo(() => {
    const map = new Map<string, string>();
    groupDetails?.members.forEach((m) => map.set(m.userId, roleLabel(m.role)));
    return map;
  }, [groupDetails?.members]);

  const groupMemberById = useMemo(() => {
    const map = new Map<string, GroupMember>();
    groupDetails?.members.forEach((m) => map.set(m.userId, m));
    return map;
  }, [groupDetails?.members]);
  const { startCall, phase: callPhase } = useCall();
  const { isPeerTyping, peerTypingCount, peerTypingIds } = useChatTyping(activeId, user?.id);

  const getChatName = () => {
    if (!activeChat) return 'this chat';
    if (activeChat.type === 'GROUP') return activeChat.title || 'this group';
    return activeChat.dmPeer?.displayName || activeChat.dmPeer?.email || 'this person';
  };

  const typingLabel = useMemo(() => {
    if (!isPeerTyping) return '';
    if (activeChat?.type === 'DIRECT') {
      return `${getChatName()} is typing`;
    }
    if (peerTypingCount === 1) {
      const uid = peerTypingIds[0];
      const member = uid ? groupMemberById.get(uid) : undefined;
      const name =
        member?.displayName || member?.username || member?.email || 'Someone';
      return `${name} is typing`;
    }
    return `${peerTypingCount} people are typing`;
  }, [
    isPeerTyping,
    activeChat?.type,
    activeChat,
    peerTypingCount,
    peerTypingIds,
    groupMemberById,
    getChatName,
  ]);

  const typingPeer = useMemo(() => {
    if (!isPeerTyping) return undefined;
    if (activeChat?.type === 'DIRECT') return activeChat.dmPeer;
    const uid = peerTypingIds[0];
    if (!uid) return undefined;
    const member = groupMemberById.get(uid);
    if (member) {
      return {
        id: member.userId,
        displayName: member.displayName,
        email: member.email,
        avatarUrl: member.avatarUrl,
      };
    }
    return { id: uid };
  }, [isPeerTyping, activeChat, peerTypingIds, groupMemberById]);

  const chatInitial = getChatName().charAt(0).toUpperCase();
  const isEmpty = !isLoading && !error && (messages?.length ?? 0) === 0;

  const { data: appSettings } = useAppSettings();
  const showReadReceipts = appSettings?.showReadReceipts !== false;

  const { mutate: addReaction } = useAddReaction();
  const { mutate: removeReaction } = useRemoveReaction();
  const { mutate: deleteMessage, isPending: isDeleting } = useDeleteMessage();
  const { mutate: pinMessage } = usePinMessage();
  const { mutate: unpinMessage } = useUnpinMessage();
  const { data: pinsData } = usePinnedMessages(activeId);
  const {
    data: unreadBoundary,
    isFetched: isUnreadBoundaryFetched,
    isFetching: isUnreadFetching,
  } = useChatUnreadBoundary(activeId);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigatingToMessageRef = useRef(false);

  const pinnedIds = new Set((pinsData?.data ?? []).map((p) => p.messageId));
  const [unreadDivider, setUnreadDivider] = useState<{
    count: number;
    beforeMessageId: string;
  } | null>(null);
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
  const markFlushTimerRef = useRef<number | null>(null);
  const readTrackingEnabledRef = useRef(false);

  const streamItems = useMemo(
    () =>
      messages?.length
        ? buildMessageStreamItems(messages, unreadDivider, unreadMessageIdsRef.current)
        : [],
    [messages, unreadDivider],
  );
  const hasActiveUnreadDivider = Boolean(unreadDivider && unreadDivider.count > 0);
  /** Hides bottom spacer while opening a chat that has unreads (before divider state is set). */
  const [suppressBottomSpacer, setSuppressBottomSpacer] = useState(false);
  const hasPendingUnreads = hasActiveUnreadDivider || suppressBottomSpacer;
  const didResetScrollForUnreadRef = useRef(false);
  const lastMessageId = messages?.length ? messages.at(-1)?.id : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const pendingFocusScrollRef = useRef(false);
  const stickToBottomRef = useRef(true);
  /** Stays true after a bottom pin until the user scrolls up (survives layout/resize flicker). */
  const followBottomRef = useRef(true);
  /** When false, blocks programmatic scroll-to-bottom (opening unread chats). */
  const allowBottomPinRef = useRef(true);
  const ackedMessageIdsRef = useRef<Set<string>>(new Set());
  const [newBelowCount, setNewBelowCount] = useState(0);

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
      const anchor = bottomAnchorRef.current;
      if (smooth) {
        if (anchor) {
          anchor.scrollIntoView({ block: 'end', behavior: 'smooth' });
        } else {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }
      } else {
        el.scrollTop = el.scrollHeight;
        if (anchor) {
          anchor.scrollIntoView({ block: 'end', behavior: 'auto' });
        }
        el.scrollTop = el.scrollHeight;
      }
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (gap < 120) {
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
    const divider = document.getElementById('unread-divider');
    const messageEl = document.getElementById(`msg-${messageId}`);
    const el = divider ?? messageEl;
    if (!container || !el) {
      scrollDebug('scrollToUnreadAnchor FAIL', {
        messageId,
        hasContainer: Boolean(container),
        hasDivider: Boolean(divider),
        hasMessageEl: Boolean(messageEl),
        attempt: unreadScrollAttemptsRef.current,
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
        attempt: unreadScrollAttemptsRef.current,
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
      attempt: unreadScrollAttemptsRef.current,
      ...scrollMetrics(container),
    });
    return true;
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
    [messages, queryClient],
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
      if (!readTrackingEnabledRef.current || !user?.id) return;

      const visible = getVisibleUnreadMessageIds(
        scrollRef.current,
        messages,
        user.id,
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
    [messages, user?.id, scheduleVisibleUnreadFlush],
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

  // Re-scroll when message list grows (e.g. images loading after send)
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

  const sidebarUnreadCount =
    (
      conversationsResponse as { data?: Array<{ id: string; unreadCount?: number }> }
    )?.data?.find((c) => c.id === activeId)?.unreadCount ?? 0;

  // Reset scroll state when switching conversations
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

  // Conversations list can load after mount - still suppress bottom pin when it shows unreads
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

  // Snapshot unread boundary once per open (immune to mark-read clearing the live query)
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

  // Keep paginating until every main-feed unread id is loaded (thread-only ids never appear here)
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

  // Thread-only unreads are not in the main timeline; clear them so divider/count stay accurate
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

  // Preserve scroll position when older messages are prepended
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

  // Initial scroll: first unread (WhatsApp-style) or latest when caught up
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

    const firstId = snapshot.firstMessageId!;
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

  // After divider renders, scroll to first unread and keep position stable
  useLayoutEffect(() => {
    if (!activeId || initialScrollPhaseRef.current === 'done') return;

    const snapshot = initialUnreadSnapshotRef.current;
    if (!snapshot || snapshot.chatId !== activeId) return;

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

    const runScroll = () => {
      if (scrollToUnreadAnchor(firstId)) {
        stickToBottomRef.current = false;
        allowBottomPinRef.current = false;
        completeInitialScroll(activeId, 'unread-anchor-ok');
        return true;
      }
      return false;
    };

    if (runScroll()) return;

    unreadScrollAttemptsRef.current += 1;
    if (unreadScrollAttemptsRef.current >= 25) {
      scrollDebug('unread scroll GAVE UP (max attempts)', {
        chatId: activeId.slice(0, 8),
        firstId: firstId.slice(0, 8),
        streamItemsLen: streamItems.length,
        hasDividerEl: Boolean(document.getElementById('unread-divider')),
      });
      completeInitialScroll(activeId, 'unread-anchor-timeout');
      return;
    }

    scrollDebug('unread scroll retry scheduled', {
      chatId: activeId.slice(0, 8),
      attempt: unreadScrollAttemptsRef.current,
      phase: initialScrollPhaseRef.current,
      streamItemsLen: streamItems.length,
    });

    const retryTimer = globalThis.setInterval(() => {
      unreadScrollAttemptsRef.current += 1;
      if (runScroll() || unreadScrollAttemptsRef.current >= 25) {
        globalThis.clearInterval(retryTimer);
        if (!initialScrollDoneRef.current) {
          scrollDebug('unread scroll retry ended', {
            success: initialScrollDoneRef.current,
            attempts: unreadScrollAttemptsRef.current,
          });
          completeInitialScroll(activeId, 'unread-anchor-retry-end');
        }
      }
    }, 80);

    return () => globalThis.clearInterval(retryTimer);
  }, [
    activeId,
    messages,
    streamItems.length,
    unreadDivider,
    hasNextPage,
    isFetchingNextPage,
    fetchOlderMessages,
    scrollToUnreadAnchor,
    completeInitialScroll,
    tryMarkReadIfCaughtUp,
    scanAndQueueVisibleUnread,
  ]);

  // Mark unread messages as read while they scroll into view
  useEffect(() => {
    if (!activeId || !user?.id || !readTrackingEnabledRef.current) return;

    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let queued = false;
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.55) continue;
          const id = entry.target.id.replace(/^msg-/, '');
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
      if (msg.senderId === user.id || msg.deletedAt) continue;
      if (!unreadMessageIdsRef.current.has(msg.id)) continue;
      if (locallyMarkedReadRef.current.has(msg.id)) continue;
      const el = document.getElementById(`msg-${msg.id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [activeId, user?.id, messages, unreadDivider?.count, scheduleVisibleUnreadFlush]);

  // Scroll when the latest message changes (send/receive) - never during unread open
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
    const sentByMe = lastMessage.senderId === user?.id;

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
  }, [messages, activeId, isLoading, isFetchingNextPage, user?.id, scrollToBottom, pendingScrollToMessageId]);

  const lastMessageBody = messages?.length
    ? bodyOf(messages.at(-1)!)
    : '';
  const lastMessageLinkKey = messages?.length
    ? getMessageLinkPreview(messages.at(-1)!, decryptedBodies)?.url ?? ''
    : '';

  // Re-scroll when the latest bubble grows (decrypt, link preview, line wrap)
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

  useEffect(() => {
    if (!activeId) return;

    const handleNewMessage = (data: { chatId: string; message: Message }) => {
      if (data.chatId !== activeId) return;

      queryClient.setQueryData(['messages', activeId], (old) =>
        mergeMessageIntoInfiniteCache(
          old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
          data.message,
        ) ?? old,
      );

      if (
        data.message.senderId !== user?.id &&
        !data.message.deletedAt
      ) {
        unreadMessageIdsRef.current.add(data.message.id);
      }

      if (data.message.senderId !== user?.id) {
        ackIncomingMessages(activeId, [data.message], user!.id);
      }
    };

    const handleReceiptDelivered = (data: {
      chatId: string;
      messageIds: string[];
      userId: string;
    }) => {
      if (data.chatId !== activeId || !user?.id || data.userId === user.id) return;
      const qk = ['messages', activeId] as const;
      const old = queryClient.getQueryData<Parameters<typeof patchReceiptStatusInCache>[0]>(qk);
      const { data: next, matchedCount } = patchReceiptStatusInCache(
        old,
        activeId,
        data.messageIds,
        'delivered',
        user.id,
      );
      queryClient.setQueryData(qk, next);
      if (matchedCount === 0 && data.messageIds.length > 0) {
        void queryClient.invalidateQueries({ queryKey: qk });
      }
    };

    const handleReceiptRead = (data: {
      chatId: string;
      messageIds: string[];
      userId: string;
    }) => {
      if (data.chatId !== activeId || !user?.id || data.userId === user.id) return;
      const qk = ['messages', activeId] as const;
      const old = queryClient.getQueryData<Parameters<typeof patchReceiptStatusInCache>[0]>(qk);
      const { data: next, matchedCount } = patchReceiptStatusInCache(
        old,
        activeId,
        data.messageIds,
        'read',
        user.id,
      );
      queryClient.setQueryData(qk, next);
      if (matchedCount === 0 && data.messageIds.length > 0) {
        void queryClient.invalidateQueries({ queryKey: qk });
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('receipt:delivered', handleReceiptDelivered);
    socket.on('receipt:read', handleReceiptRead);
    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('receipt:delivered', handleReceiptDelivered);
      socket.off('receipt:read', handleReceiptRead);
    };
  }, [activeId, socket, queryClient, user?.id]);

  useEffect(() => {
    if (!activeId || !user?.id) return;

    const handleReactionAdded = (data: {
      chatId: string;
      messageId: string;
      emoji: string;
      userId: string;
    }) => {
      if (data.chatId !== activeId) return;
      queryClient.setQueryData(['messages', activeId], (old: unknown) =>
        patchReactionOnMessage(
          old as Parameters<typeof patchReactionOnMessage>[0],
          data.messageId,
          data.emoji,
          'add',
          data.userId,
          user.id,
        ),
      );
    };

    const handleReactionRemoved = (data: {
      chatId: string;
      messageId: string;
      emoji: string;
      userId: string;
    }) => {
      if (data.chatId !== activeId) return;
      queryClient.setQueryData(['messages', activeId], (old: unknown) =>
        patchReactionOnMessage(
          old as Parameters<typeof patchReactionOnMessage>[0],
          data.messageId,
          data.emoji,
          'remove',
          data.userId,
          user.id,
        ),
      );
    };

    socket.on('reaction:added', handleReactionAdded);
    socket.on('reaction:removed', handleReactionRemoved);
    return () => {
      socket.off('reaction:added', handleReactionAdded);
      socket.off('reaction:removed', handleReactionRemoved);
    };
  }, [activeId, socket, queryClient, user?.id]);

  useEffect(() => {
    if (!activeId || !user?.id) return;

    const handleUpdated = (data: { chatId: string; message: Message }) => {
      if (data.chatId !== activeId) return;
      queryClient.setQueryData(['messages', activeId], (old: unknown) =>
        patchMessageInCache(old as Parameters<typeof patchMessageInCache>[0], data.message.id, {
          ciphertext: data.message.ciphertext ?? '',
          editedAt: data.message.editedAt,
          contentMeta: data.message.contentMeta,
        }),
      );
    };

    const handleDeleted = (data: { chatId: string; messageId: string }) => {
      if (data.chatId !== activeId) return;
      queryClient.setQueryData(['messages', activeId], (old: unknown) =>
        removeMessageFromCache(old as Parameters<typeof removeMessageFromCache>[0], data.messageId),
      );
      queryClient.invalidateQueries({ queryKey: ['pins', activeId] });
    };

    const handlePinned = () => {
      queryClient.invalidateQueries({ queryKey: ['pins', activeId] });
    };

    socket.on('message:updated', handleUpdated);
    socket.on('message:deleted', handleDeleted);
    socket.on('message:pinned', handlePinned);
    socket.on('message:unpinned', handlePinned);
    return () => {
      socket.off('message:updated', handleUpdated);
      socket.off('message:deleted', handleDeleted);
      socket.off('message:pinned', handlePinned);
      socket.off('message:unpinned', handlePinned);
    };
  }, [activeId, socket, queryClient, user?.id]);

  useEffect(() => {
    ackedMessageIdsRef.current.clear();
    setReactionPickerFor(null);
    setOptionsFor(null);
  }, [activeId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerFor(null);
        setOptionsFor(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ack delivery for loaded messages; read receipts fire when scrolled to bottom
  useEffect(() => {
    if (!activeId || !isConnected || isLoading || !messages?.length || !user?.id) return;
    if (!initialScrollDoneRef.current) return;
    const pending = messages.filter(
      (m) => m.senderId !== user.id && !ackedMessageIdsRef.current.has(m.id),
    );
    if (pending.length === 0) return;
    pending.forEach((m) => ackedMessageIdsRef.current.add(m.id));
    void ackIncomingMessages(activeId, pending, user.id).catch(() => {
      pending.forEach((m) => ackedMessageIdsRef.current.delete(m.id));
    });
  }, [activeId, chatFocusKey, isConnected, isLoading, messages, user?.id]);

  useEffect(() => {
    if (!activeId || !isConnected) return;

    socket.subscribeToChat(activeId);

    return () => {
      socket.unsubscribeFromChat(activeId);
    };
  }, [activeId, isConnected, socket, queryClient]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    globalThis.setTimeout(() => setToast(null), 2500);
  }, []);

  const scrollToReplyParent = useCallback(
    (reply: ReplyPreview | null | undefined, replyToId?: string | null) => {
      const parentId = reply?.id ?? replyToId;
      if (!parentId) return;
      requestScrollToMessage(parentId);
    },
    [requestScrollToMessage],
  );

  const scrollMessageIntoView = useCallback((messageId: string): boolean => {
    const container = scrollRef.current;
    const el = document.getElementById(`msg-${messageId}`);
    if (!container || !el) return false;

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
  }, []);

  const flashMessageHighlight = useCallback((messageId: string) => {
    setHighlightMessageId(messageId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightMessageId(null);
      highlightTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
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
        showToast('Message not found in this chat');
      }
      return;
    }

    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;
    let cancelled = false;

    const finishScroll = () => {
      if (cancelled) return;
      clearPendingScrollToMessage();
      globalThis.setTimeout(() => {
        flashMessageHighlight(messageId);
        globalThis.setTimeout(() => {
          navigatingToMessageRef.current = false;
        }, 2100);
      }, 400);
    };

    const attemptScroll = () => {
      if (scrollMessageIntoView(messageId)) {
        finishScroll();
        if (retryTimer) clearInterval(retryTimer);
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
          if (attempts >= 15) {
            navigatingToMessageRef.current = false;
            clearPendingScrollToMessage();
            showToast("Couldn't find that message");
          }
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
  }, [
    pendingScrollToMessageId,
    activeSection,
    isLoading,
    messages?.length,
    hasNextPage,
    isFetchingNextPage,
    fetchOlderMessages,
    scrollMessageIntoView,
    flashMessageHighlight,
    clearPendingScrollToMessage,
    showToast,
  ]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
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
  };

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

  const wasPeerTypingRef = useRef(false);
  useEffect(() => {
    if (isPeerTyping && !wasPeerTypingRef.current && followBottomRef.current) {
      scrollToBottom(false);
    }
    wasPeerTypingRef.current = isPeerTyping;
  }, [isPeerTyping, scrollToBottom]);

  const handleMenuAction = useCallback(
    (msg: Message, action: MessageMenuAction) => {
      if (!activeId) return;
      switch (action) {
        case 'copy': {
          const text = getMessageCopyText(msg, decryptedBodies, user?.id);
          if (text) void navigator.clipboard.writeText(text).then(() => showToast('Copied'));
          break;
        }
        case 'edit':
          setReplyingTo(null);
          setEditingMessage({ id: msg.id, text: bodyOf(msg) || '' });
          break;
        case 'delete':
          setDeleteTarget(msg);
          break;
        case 'pin':
          pinMessage(
            { chatId: activeId, messageId: msg.id },
            { onSuccess: () => showToast('Message pinned'), onError: () => showToast("Couldn't pin this message") },
          );
          break;
        case 'unpin':
          unpinMessage(
            { chatId: activeId, messageId: msg.id },
            { onSuccess: () => showToast('Message unpinned'), onError: () => showToast("Couldn't unpin this message") },
          );
          break;
        case 'forward':
          setForwarding(msg);
          break;
      }
    },
    [
      activeId,
      bodyOf,
      decryptedBodies,
      deleteMessage,
      pinMessage,
      setEditingMessage,
      setReplyingTo,
      showToast,
      unpinMessage,
      user?.id,
    ],
  );

  const handleReactionPick = useCallback(
    (messageId: string, emoji: string) => {
      if (!activeId) return;
      const msg = messages?.find((m) => m.id === messageId);
      const alreadyMine = msg?.reactionsSummary?.some(
        (r: { emoji: string; byMe?: boolean }) => r.emoji === emoji && r.byMe,
      );
      if (alreadyMine) {
        removeReaction({ chatId: activeId, messageId, emoji });
      } else {
        addReaction({ chatId: activeId, messageId, emoji });
      }
      setReactionPickerFor(null);
    },
    [activeId, messages, addReaction, removeReaction],
  );

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <MessageListSkeleton count={7} />
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>Messages couldn't be loaded. Please refresh the page.</div>;
  }

  const newBelowLabel =
    newBelowCount === 1 ? '1 new message' : `${newBelowCount > 99 ? '99+' : newBelowCount} new messages`;

  return (
    <>
    <div className={styles.messageArea}>
      {toast && <div className={styles.toast}>{toast}</div>}
    <div className={styles.container} ref={scrollRef} onScroll={handleScroll}>
      <motion.div
        className={`${styles.stream} ${hasPendingUnreads ? styles.streamWithUnread : ''}`}
        ref={streamRef}
      >
        {isEmpty ? (
          <>
          {isPeerTyping && (
            <TypingIndicator
              visible
              label={typingLabel}
              userId={typingPeer?.id}
              avatarUrl={typingPeer?.avatarUrl}
              displayName={typingPeer?.displayName}
              email={typingPeer?.email}
            />
          )}
          <motion.div
            className={styles.emptyState}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className={styles.emptyAvatar}>{chatInitial}</div>
            <h3 className={styles.emptyTitle}>
              {activeChat?.type === 'GROUP'
                ? `Welcome to #${getChatName()}`
                : `This is the beginning of your chat with ${getChatName()}`}
            </h3>
            <p className={styles.emptySubtitle}>
              {activeChat?.type === 'GROUP'
                ? 'Be the first to say something and get the conversation going.'
                : 'Send a message to break the ice. Your conversation is private between you two.'}
            </p>
            <div className={styles.emptyHints}>
              <span className={styles.emptyHint}>
                <Sparkles size={14} />
                Say hi
              </span>
              <span className={styles.emptyHint}>
                <MessageCircle size={14} />
                Share an update
              </span>
            </div>
            <p className={styles.emptyFooter}>Type a message below to get started</p>
          </motion.div>
          </>
        ) : (
          <>
            {!hasPendingUnreads && <div className={styles.spacer} />}
            {isFetchingNextPage && (
              <div className={styles.fetchLoading}>
                <Loader2 className={styles.spinner} size={16} />
              </div>
            )}

            {streamItems.map((item) => {
              if (item.type === 'date') {
                return (
                  <motion.div
                    key={`date-${item.key}`}
                    className={styles.dateDivider}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className={styles.dateDividerLine} aria-hidden />
                    <span className={styles.dateDividerPill}>
                      {item.label}
                      <ChevronDown size={14} className={styles.dateDividerChevron} />
                    </span>
                    <span className={styles.dateDividerLine} aria-hidden />
                  </motion.div>
                );
              }

              if (item.type === 'unread') {
                return (
                  <div
                    key={item.key}
                    id="unread-divider"
                    className={styles.unreadDivider}
                    role="separator"
                    aria-label={formatUnreadDividerLabel(item.count)}
                  >
                    <span className={styles.unreadDividerLine} aria-hidden />
                    <span className={styles.unreadDividerPill}>
                      {formatUnreadDividerLabel(item.count)}
                    </span>
                    <span className={styles.unreadDividerLine} aria-hidden />
                  </div>
                );
              }

              const msg = item.message;
              const displayMsg = messageWithDecryptedMeta(msg, decryptedBodies);
              const isMe = msg.senderId === user?.id;
              const isLast = msg.id === lastMessageId;
              const messageFiles = getMessageFiles(displayMsg);
              const hasMedia = Boolean(messageFiles?.length);
              const displayBody = bodyOf(msg);
              const hasCaption = Boolean(displayBody?.trim());
              const usesGroupedFiles = hasMedia && shouldUseGroupedFileLayout(displayMsg);
              const groupedWithCaption = usesGroupedFiles && hasCaption;
              const singleGroupedFile = usesGroupedFiles && messageFiles?.length === 1;
              const wideMediaLayout =
                hasMedia &&
                usesGroupedFiles &&
                Boolean(messageFiles && (messageFiles.length > 1 || groupedWithCaption));
              const compactMediaLayout = hasMedia && !wideMediaLayout;
              const isVoiceNote = isVoiceMessage(displayMsg);
                          const isPoll = msg.kind === 'POLL' && Boolean(msg.contentMeta?.pollId);
              const callMeta = getCallFromMessageMeta(msg.contentMeta);
              const transcriptMeta = getCallTranscriptFromMeta(msg.contentMeta);
              const groupActivityMeta = getGroupActivityFromMeta(msg.contentMeta);
              const isGroupActivity =
                msg.kind === 'SYSTEM' && Boolean(groupActivityMeta) && !callMeta;
              const isCallSystem = msg.kind === 'SYSTEM' && Boolean(callMeta);
              const isCallTranscript = msg.kind === 'SYSTEM' && Boolean(transcriptMeta);
              const showMediaTimestamp = hasMedia && !hasCaption;
              const mediaOnly = showMediaTimestamp && !usesGroupedFiles;
              const hasReactions = Boolean(msg.reactionsSummary && msg.reactionsSummary.length > 0);
              const isOptionsOpen = optionsFor === msg.id;
              const isReactionPickerOpen = reactionPickerFor === msg.id;
              const isPinned = pinnedIds.has(msg.id);
              const isHighlighted =
                highlightMessageId === msg.id || msg.id === activeSearchMessageId;
              const linkPreview =
                !msg.deletedAt ? getMessageLinkPreview(msg, decryptedBodies) ?? null : null;

              if (isGroupActivity) {
                return (
                  <div key={msg.id} id={`msg-${msg.id}`}>
                    <GroupActivityBubble ciphertext={msg.ciphertext} meta={groupActivityMeta ?? undefined} />
                  </div>
                );
              }

              if (isCallTranscript && transcriptMeta) {
                return (
                  <div key={msg.id} id={`msg-${msg.id}`}>
                    <CallTranscriptBubble transcript={transcriptMeta} preview={msg.ciphertext} />
                  </div>
                );
              }

              if (isCallSystem && callMeta && user) {
                const peer = activeChat?.dmPeer;
                return (
                  <div key={msg.id} id={`msg-${msg.id}`}>
                    <CallMessageBubble
                      call={callMeta}
                      ciphertext={msg.ciphertext}
                      isMe={isMe}
                      myUserId={user.id}
                      onRedial={
                        isDirectChat && peer && callPhase === 'idle' && activeId
                          ? () =>
                              void startCall({
                                chatId: activeId,
                                peerUserId: peer.id,
                                peerDisplayName:
                                  peer.displayName || peer.email || 'Contact',
                                video: callMeta.kind === 'VIDEO',
                              })
                          : undefined
                      }
                    />
                  </div>
                );
              }

              return (
                <motion.div
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  onAnimationComplete={isLast ? handleLastMessageSettled : undefined}
                  className={`${styles.messageWrapper} ${isMe ? styles.isMe : ''} ${
                    wideMediaLayout ? styles.messageWrapperWithMedia : ''
                  } ${compactMediaLayout ? styles.messageWrapperMediaCompact : ''}`}
                >
                  {!isMe && (
                    <UserAvatar
                      userId={msg.senderId}
                      avatarUrl={msg.sender?.avatarUrl}
                      displayName={msg.sender?.displayName}
                      email={msg.sender?.email}
                      className={styles.avatar}
                      fallbackFontSize="0.9rem"
                    />
                  )}

                  <div className={styles.bubbleContent}>
                    {isPinned && (
                      <span className={styles.pinnedBadge} aria-label="Pinned message">
                        <Pin size={11} strokeWidth={2.5} aria-hidden />
                        Pinned
                      </span>
                    )}
                    {!isMe && (
                      <div className={styles.senderNameRow}>
                        <LiveUserName
                          userId={msg.senderId}
                          displayName={msg.sender?.displayName}
                          email={msg.sender?.email}
                          className={styles.senderName}
                        />
                        {isGroupChat && memberRoleByUserId.get(msg.senderId) && (
                          <span className={styles.roleBadge}>
                            {memberRoleByUserId.get(msg.senderId)}
                          </span>
                        )}
                      </div>
                    )}

                    <div className={styles.bubbleContainer}>
                      <div
                        className={`${styles.bubbleWrap} ${hasReactions ? styles.bubbleWrapWithReactions : ''} ${
                          isHighlighted ? styles.messageHighlight : ''
                        }`}
                      >
                        <div
                          role={isMe && msg.status === 'error' ? 'button' : undefined}
                          tabIndex={isMe && msg.status === 'error' ? 0 : undefined}
                          title={isMe && msg.status === 'error' ? 'Tap to retry sending' : undefined}
                          onClick={
                            isMe && msg.status === 'error'
                              ? () => void handleRetryFailedMessage(msg)
                              : undefined
                          }
                          onKeyDown={
                            isMe && msg.status === 'error'
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    void handleRetryFailedMessage(msg);
                                  }
                                }
                              : undefined
                          }
                          className={`${styles.bubble} ${isPinned ? styles.bubblePinned : ''} ${
                            isPoll ? styles.bubblePoll : ''
                          } ${
                            hasMedia && !isPoll ? styles.bubbleHasMedia : ''
                          } ${mediaOnly ? styles.bubbleMediaOnly : ''} ${
                            groupedWithCaption ? styles.bubbleGroupedWithCaption : ''
                          } ${singleGroupedFile ? styles.bubbleSingleFile : ''} ${
                            usesGroupedFiles && !hasCaption ? styles.bubbleFilesOnly : ''
                          } ${isVoiceNote ? styles.bubbleVoiceNote : ''} ${
                            isMe && msg.status === 'error' ? styles.bubbleFailed : ''
                          }`}
                        >
                        {msg.threadRootId && msg.broadcastToChannel && supportsThreads && (
                          <div className={styles.threadBroadcastHeader}>
                            <span>Replied to a thread: </span>
                            <button
                              type="button"
                              className={styles.threadBroadcastLink}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (msg.threadRootId) openThread(msg.threadRootId);
                              }}
                            >
                              {(() => {
                                const root = messages?.find((m) => m.id === msg.threadRootId);
                                return root
                                  ? getMessagePreviewText(root, decryptedBodies, user?.id)
                                  : 'View thread';
                              })()}
                            </button>
                          </div>
                        )}
                        {(msg.replyTo || msg.replyToId) && !msg.broadcastToChannel && (
                          <button
                            type="button"
                            className={styles.replyQuote}
                            onClick={(e) => {
                              e.stopPropagation();
                              scrollToReplyParent(msg.replyTo, msg.replyToId);
                            }}
                            aria-label={
                              msg.replyTo
                                ? `View original message from ${replyPreviewAuthor(msg.replyTo, user?.id)}`
                                : 'View original message'
                            }
                          >
                            {msg.replyTo ? (
                              <>
                                <span className={styles.replyQuoteAuthor}>
                                  {replyPreviewAuthor(msg.replyTo, user?.id)}
                                </span>
                                <span className={styles.replyQuoteText}>
                                  {replyPreviewLabel(msg.replyTo, decryptedBodies, user?.id)}
                                </span>
                              </>
                            ) : (
                              <span className={styles.replyQuoteText}>View original message</span>
                            )}
                          </button>
                        )}
                        {isPoll && msg.contentMeta?.pollId && (
                          <div className={styles.pollBlock}>
                            <PollMessage
                              pollId={msg.contentMeta.pollId}
                              isMe={isMe}
                              decryptedPoll={getDecryptedPollMeta(msg, decryptedBodies, user?.id ?? '')}
                            />
                          </div>
                        )}
                        {hasMedia && !isPoll && (
                          <div
                            className={`${styles.mediaBlock} ${
                              wideMediaLayout ? styles.mediaBlockGrouped : ''
                            } ${compactMediaLayout ? styles.mediaBlockCompact : ''}`}
                          >
                            <MediaAttachment
                              kind={displayMsg.kind ?? 'FILE'}
                              contentMeta={displayMsg.contentMeta}
                              e2eeMessage={msg}
                              transportMeta={displayMsg.contentMeta as Record<string, unknown> | undefined}
                              embedded
                              caption={groupedWithCaption ? displayBody : undefined}
                              bubbleVariant={isMe ? 'sent' : 'received'}
                              onMediaLoad={isLast ? handleMediaLoaded : undefined}
                              mediaTimestamp={
                                showMediaTimestamp
                                  ? {
                                      createdAt: msg.createdAt,
                                      editedAt: msg.editedAt,
                                      isMe,
                                      receiptStatus:
                                        isMe && isDirectChat && showReadReceipts
                                          ? msg.receiptStatus ?? 'sent'
                                          : undefined,
                                    }
                                  : undefined
                              }
                            />
                          </div>
                        )}
                        {linkPreview && groupedWithCaption ? (
                          <LinkPreviewBlock
                            preview={linkPreview}
                            displayAs={linkDisplayMode(linkPreview)}
                            bubbleVariant={isMe ? 'sent' : 'received'}
                            onDisplayAsChange={(mode) => {
                              if (!activeId) return;
                              updateLinkDisplay.mutate({
                                chatId: activeId,
                                messageId: msg.id,
                                preview: linkPreview,
                                displayAs: mode,
                                existingMeta: msg.contentMeta,
                              });
                            }}
                          />
                        ) : null}
                        <div className={styles.bubbleBody}>
                          {hasCaption && !usesGroupedFiles && !isPoll && (() => {
                            const bodyText = linkPreview
                              ? messageTextWithoutLink(displayBody, linkPreview.url)
                              : displayBody;
                            return bodyText?.trim() ? (
                              <p>
                                {searchQuery ? (
                                  <HighlightedMessageText
                                    text={bodyText}
                                    query={searchQuery}
                                    isActiveMessage={msg.id === activeSearchMessageId}
                                    markClassName={styles.searchMark}
                                    markActiveClassName={styles.searchMarkActive}
                                  />
                                ) : (
                                  <MentionHighlightedText
                                    text={bodyText}
                                    mentionClassName={styles.mentionMark}
                                  />
                                )}
                              </p>
                            ) : null;
                          })()}
                          {linkPreview && !groupedWithCaption ? (
                            <LinkPreviewBlock
                              preview={linkPreview}
                              displayAs={linkDisplayMode(linkPreview)}
                              bubbleVariant={isMe ? 'sent' : 'received'}
                              onDisplayAsChange={(mode) => {
                                if (!activeId) return;
                                updateLinkDisplay.mutate({
                                  chatId: activeId,
                                  messageId: msg.id,
                                  preview: linkPreview,
                                  displayAs: mode,
                                  existingMeta: msg.contentMeta,
                                });
                              }}
                            />
                          ) : null}
                          {!mediaOnly && (
                            <MessageMeta
                              createdAt={msg.createdAt}
                              editedAt={msg.editedAt}
                              isMe={isMe}
                              sendStatus={isMe ? msg.status : undefined}
                              receiptStatus={
                                isMe && isDirectChat && showReadReceipts && !msg.status
                                  ? msg.receiptStatus ?? 'sent'
                                  : undefined
                              }
                            />
                          )}
                        </div>
                        </div>
                        {(msg.threadReplyCount ?? 0) > 0 && !msg.threadRootId && supportsThreads && (
                          <button
                            type="button"
                            className={styles.threadSummary}
                            onClick={() => openThread(msg.id)}
                          >
                            {msg.threadReplyCount === 1
                              ? '1 reply'
                              : `${msg.threadReplyCount} replies`}
                            {msg.threadLastReplyAt
                              ? ` · Last reply ${formatThreadLastReply(msg.threadLastReplyAt)}`
                              : ''}
                          </button>
                        )}
                        {hasReactions && (
                          <div className={styles.reactionsOnBubble}>
                            {msg.reactionsSummary!.map((r) => (
                              <button
                                key={r.emoji}
                                type="button"
                                className={`${styles.reaction} ${r.byMe ? styles.reactionMine : ''}`}
                                onClick={() => handleReactionPick(msg.id, r.emoji)}
                              >
                                <span className={styles.reactionEmoji}>{r.emoji}</span>
                                <span className={styles.reactionCount}>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div
                          className={`${styles.actions} ${isMe ? styles.actionsMe : ''} ${
                            isOptionsOpen || isReactionPickerOpen ? styles.actionsPinned : ''
                          }`}
                          ref={
                            reactionPickerFor === msg.id || optionsFor === msg.id
                              ? reactionPickerRef
                              : undefined
                          }
                        >
                        <button
                          type="button"
                          className={styles.actionBtn}
                          aria-label="Add reaction"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionPickerFor((cur) => (cur === msg.id ? null : msg.id));
                          }}
                        >
                          <Smile size={16} />
                        </button>
                        {reactionPickerFor === msg.id && (
                          <div className={styles.reactionPicker}>
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className={styles.reactionPickBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReactionPick(msg.id, emoji);
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          className={styles.actionBtn}
                          aria-label={supportsThreads ? 'Reply in thread' : 'Reply'}
                          onClick={() => {
                            if (supportsThreads) {
                              const rootId =
                                msg.threadRootId && msg.broadcastToChannel
                                  ? msg.threadRootId
                                  : msg.id;
                              openThread(rootId);
                            } else {
                              setReplyingTo(msg.id);
                            }
                          }}
                        >
                          <Reply size={16} />
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          aria-label="More options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionPickerFor(null);
                            setOptionsFor((cur) => (cur === msg.id ? null : msg.id));
                          }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {optionsFor === msg.id && (
                          <MessageOptionsMenu
                            message={msg}
                            isMe={isMe}
                            isPinned={pinnedIds.has(msg.id)}
                            canPin={isDirectChat || canModerate}
                            userId={user?.id}
                            canModerateDelete={canModerate && !isMe}
                            decryptedBodies={decryptedBodies}
                            copyText={getMessageCopyText(msg, decryptedBodies, user?.id)}
                            onAction={(action) => handleMenuAction(msg, action)}
                            onClose={() => setOptionsFor(null)}
                          />
                        )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <TypingIndicator
              visible={isPeerTyping}
              label={typingLabel}
              userId={typingPeer?.id}
              avatarUrl={typingPeer?.avatarUrl}
              displayName={typingPeer?.displayName}
              email={typingPeer?.email}
            />
            <div ref={bottomAnchorRef} className={styles.scrollAnchor} aria-hidden />
          </>
        )}
      </motion.div>
    </div>
    {newBelowCount > 0 && (
      <button
        type="button"
        className={styles.newMessagesBtn}
        onClick={jumpToLatest}
        aria-label={newBelowLabel}
      >
        <ChevronDown size={20} strokeWidth={2.5} />
        <span className={styles.newMessagesCount}>
          {newBelowCount > 99 ? '99+' : newBelowCount}
        </span>
      </button>
    )}
    </div>
    {forwarding && activeId && (
      <ForwardMessageModal
        message={forwarding}
        fromChatId={activeId}
        onClose={() => setForwarding(null)}
      />
    )}
    <ConfirmModal
      open={Boolean(deleteTarget)}
      title="Delete message?"
      description="This message will be removed for everyone in this chat. This action cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="danger"
      isLoading={isDeleting}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => {
        if (!activeId || !deleteTarget) return;
        deleteMessage(
          { chatId: activeId, messageId: deleteTarget.id },
          {
            onSuccess: () => {
              setDeleteTarget(null);
              showToast('Message deleted');
            },
            onError: () => showToast("Couldn't delete this message"),
          },
        );
      }}
    />
    </>
  );
};

export default MessageStream;
