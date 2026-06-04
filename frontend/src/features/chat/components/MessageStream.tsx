import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, Sparkles, ChevronDown } from 'lucide-react';
import MessageListSkeleton from './MessageListSkeleton';
import {
  ackIncomingMessages,
  patchReceiptFromSocket,
  type ReceiptSocketPayload,
} from '../utils/messageReceipts';
import {
  mergeMessageIntoInfiniteCache,
  type MessagePage,
} from '../utils/messageQueryCache';
import type { InfiniteData } from '@tanstack/react-query';
import { patchReactionOnMessage } from '../utils/messageReactions';
import { patchMessageInCache, removeMessageFromCache, getMessageCopyText } from '../utils/messageCache';
import { type MessageMenuAction } from './MessageOptionsMenu';
import ForwardMessageModal from './ForwardMessageModal';
import ConfirmModal from './ConfirmModal';
import { fetchGroup, type GroupMember } from '../api/groupsApi';
import { canModerateMessages, roleLabel } from '../utils/groupRoles';
import { useUpdateLinkDisplay } from '../hooks/useUpdateLinkDisplay';
import { useAppSettings } from '../../settings/hooks/useUserSettings';
import { useCall } from '../../calls/CallProvider';
import { retryOutboxMessage } from '../../sync/sendMessage';
import type { Message, ReplyPreview, LinkDisplayMode } from '../types';
import { buildMessageStreamItems } from '../utils/messageStreamItems';
import {
  formatNewMessagesBadgeCount,
  formatNewMessagesLabel,
  getEmptyStateCopy,
} from '../utils/messageStream.helpers';
import {
  useMessageBodies,
  getMessageDisplayBody,
  getMessageLinkPreview,
} from '../../e2ee/useMessageBodies';
import TypingIndicator from './TypingIndicator';
import { useMessageStreamTyping } from '../hooks/useMessageStreamTyping';
import { useMessageStreamScroll } from '../hooks/useMessageStreamScroll';
import MessageStreamRow, {
  MessageStreamDateDivider,
  MessageStreamUnreadDivider,
  type MessageStreamRowProps,
} from './MessageStreamRow';
type MessageStreamProps = {
  isPeerTyping: boolean;
  peerTypingCount: number;
  peerTypingIds: string[];
};

const MessageStream: React.FC<MessageStreamProps> = ({
  isPeerTyping,
  peerTypingCount,
  peerTypingIds,
}) => {
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
  const { user, e2eeKeysLocked } = useAuth();
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const updateLinkDisplay = useUpdateLinkDisplay();

  const handleRetryFailedMessage = useCallback(
    async (msg: Message) => {
      const clientId = msg.clientMessageId ?? msg.id;
      const result = await retryOutboxMessage(clientId);
      if (!result || result.queued) return;
      queryClient.setQueryData<InfiniteData<MessagePage> | undefined>(
        ['messages', result.message.chatId],
        (old) =>
        mergeMessageIntoInfiniteCache(old, {
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
    (msg: Message) =>
      getMessageDisplayBody(msg, decryptedBodies, user?.id ?? '', e2eeKeysLocked),
    [decryptedBodies, user?.id, e2eeKeysLocked],
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
    queryFn: () => {
      if (!activeId) throw new Error('activeId required');
      return fetchGroup(activeId);
    },
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

  const { typingLabel, typingPeer, getChatName } = useMessageStreamTyping(
    isPeerTyping,
    peerTypingCount,
    peerTypingIds,
    activeChat,
    groupMemberById,
  );

  const chatName = getChatName();
  const chatInitial = chatName.charAt(0).toUpperCase();
  const emptyStateCopy = getEmptyStateCopy(activeChat?.type, chatName);
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
  const ackedMessageIdsRef = useRef<Set<string>>(new Set());

  const pinnedIds = new Set((pinsData?.data ?? []).map((p) => p.messageId));
  const lastMessageId = messages?.length ? messages.at(-1)?.id : null;

  const sidebarUnreadCount =
    (
      conversationsResponse as { data?: Array<{ id: string; unreadCount?: number }> }
    )?.data?.find((c) => c.id === activeId)?.unreadCount ?? 0;

  const lastMessage = messages?.at(-1);
  const lastMessageBody = lastMessage ? bodyOf(lastMessage) : '';
  const lastMessageLinkKey = lastMessage
    ? getMessageLinkPreview(lastMessage, decryptedBodies)?.url ?? ''
    : '';

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    globalThis.setTimeout(() => setToast(null), 2500);
  }, []);

  const flashMessageHighlight = useCallback((messageId: string) => {
    setHighlightMessageId(messageId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightMessageId(null);
      highlightTimerRef.current = null;
    }, 2000);
  }, []);

  const {
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
    trackIncomingUnread,
    isInitialScrollDone,
  } = useMessageStreamScroll({
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
    userId: user?.id,
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
    onFlashHighlight: flashMessageHighlight,
    onShowToast: showToast,
  });

  const streamItems = useMemo(
    () =>
      messages?.length
        ? buildMessageStreamItems(messages, unreadDivider, unreadMessageIdsRef.current)
        : [],
    [messages, unreadDivider],
  );

  const scrollToReplyParent = useCallback(
    (reply: ReplyPreview | null | undefined, replyToId?: string | null) => {
      const parentId = reply?.id ?? replyToId;
      if (!parentId) return;
      requestScrollToMessage(parentId);
    },
    [requestScrollToMessage],
  );

  const handleLinkDisplayChange = useCallback(
    (
      messageId: string,
      preview: NonNullable<ReturnType<typeof getMessageLinkPreview>>,
      mode: LinkDisplayMode,
      existingMeta: Message['contentMeta'],
    ) => {
      if (!activeId) return;
      updateLinkDisplay.mutate({
        chatId: activeId,
        messageId,
        preview,
        displayAs: mode,
        existingMeta,
      });
    },
    [activeId, updateLinkDisplay],
  );

  useEffect(() => {
    if (!activeId || !isConnected || isLoading || !messages?.length || !user?.id) return;
    if (!isInitialScrollDone()) return;
    const pending = messages.filter(
      (m) => m.senderId !== user.id && !ackedMessageIdsRef.current.has(m.id),
    );
    if (pending.length === 0) return;
    pending.forEach((m) => ackedMessageIdsRef.current.add(m.id));
    void ackIncomingMessages(activeId, pending, user.id).catch(() => {
      pending.forEach((m) => ackedMessageIdsRef.current.delete(m.id));
    });
  }, [activeId, chatFocusKey, isConnected, isLoading, messages, user?.id, isInitialScrollDone]);

  useEffect(() => {
    if (!activeId || !isConnected) return;
    socket.subscribeToChat(activeId);
    return () => {
      socket.unsubscribeFromChat(activeId);
    };
  }, [activeId, isConnected, socket]);

  useEffect(() => {
    if (!activeId) return;

    const handleNewMessage = (data: { chatId: string; message: Message }) => {
      if (data.chatId !== activeId) return;

      queryClient.setQueryData<InfiniteData<MessagePage> | undefined>(['messages', activeId], (old) =>
        mergeMessageIntoInfiniteCache(old, data.message) ?? old,
      );

      trackIncomingUnread(data.message, user?.id);

      if (data.message.senderId !== user?.id && user?.id) {
        ackIncomingMessages(activeId, [data.message], user.id);
      }
    };

    const handleReceiptDelivered = (data: ReceiptSocketPayload) => {
      if (!user?.id) return;
      patchReceiptFromSocket(queryClient, user.id, data, 'delivered', activeId);
    };

    const handleReceiptRead = (data: ReceiptSocketPayload) => {
      if (!user?.id) return;
      patchReceiptFromSocket(queryClient, user.id, data, 'read', activeId);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('receipt:delivered', handleReceiptDelivered);
    socket.on('receipt:read', handleReceiptRead);
    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('receipt:delivered', handleReceiptDelivered);
      socket.off('receipt:read', handleReceiptRead);
    };
  }, [activeId, socket, queryClient, user?.id, trackIncomingUnread]);

  useEffect(() => {
    if (!activeId || !user?.id) return;

    const handleReactionAdded = (data: {
      chatId: string;
      messageId: string;
      emoji: string;
      userId: string;
    }) => {
      if (data.chatId !== activeId) return;
      queryClient.setQueryData<InfiniteData<MessagePage> | undefined>(['messages', activeId], (old) =>
        patchReactionOnMessage(old, data.messageId, data.emoji, 'add', data.userId, user.id),
      );
    };

    const handleReactionRemoved = (data: {
      chatId: string;
      messageId: string;
      emoji: string;
      userId: string;
    }) => {
      if (data.chatId !== activeId) return;
      queryClient.setQueryData<InfiniteData<MessagePage> | undefined>(['messages', activeId], (old) =>
        patchReactionOnMessage(old, data.messageId, data.emoji, 'remove', data.userId, user.id),
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

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

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

  const messageRowSharedProps = useMemo(
    (): Omit<MessageStreamRowProps, 'msg' | 'isLast' | 'isHighlighted'> => ({
      messages,
      decryptedBodies,
      userId: user?.id,
      activeId,
      isDirectChat,
      isGroupChat,
      supportsThreads,
      showReadReceipts,
      memberRoleByUserId,
      pinnedIds,
      searchQuery,
      activeSearchMessageId,
      activeChat,
      callPhase,
      reactionPickerFor,
      optionsFor,
      reactionPickerRef,
      canModerate,
      bodyOf,
      onRetryFailedMessage: handleRetryFailedMessage,
      onScrollToReplyParent: scrollToReplyParent,
      onOpenThread: openThread,
      onSetReplyingTo: setReplyingTo,
      onReactionPick: handleReactionPick,
      onSetReactionPickerFor: setReactionPickerFor,
      onSetOptionsFor: setOptionsFor,
      onMenuAction: handleMenuAction,
      onStartCall: startCall,
      onMediaLoad: handleMediaLoaded,
      onLastMessageSettled: handleLastMessageSettled,
      onLinkDisplayChange: handleLinkDisplayChange,
    }),
    [
      messages,
      decryptedBodies,
      user?.id,
      activeId,
      isDirectChat,
      isGroupChat,
      supportsThreads,
      showReadReceipts,
      memberRoleByUserId,
      pinnedIds,
      searchQuery,
      activeSearchMessageId,
      activeChat,
      callPhase,
      reactionPickerFor,
      optionsFor,
      canModerate,
      bodyOf,
      handleRetryFailedMessage,
      scrollToReplyParent,
      openThread,
      setReplyingTo,
      handleReactionPick,
      handleMenuAction,
      startCall,
      handleMediaLoaded,
      handleLastMessageSettled,
      handleLinkDisplayChange,
    ],
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

  const newBelowLabel = formatNewMessagesLabel(newBelowCount);

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
                  <h3 className={styles.emptyTitle}>{emptyStateCopy.title}</h3>
                  <p className={styles.emptySubtitle}>{emptyStateCopy.subtitle}</p>
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
                      <MessageStreamDateDivider key={`date-${item.key}`} itemKey={item.key} label={item.label} />
                    );
                  }

                  if (item.type === 'unread') {
                    return <MessageStreamUnreadDivider key={item.key} count={item.count} />;
                  }

                  const msg = item.message;
                  return (
                    <MessageStreamRow
                      key={msg.id}
                      msg={msg}
                      {...messageRowSharedProps}
                      isLast={msg.id === lastMessageId}
                      isHighlighted={
                        highlightMessageId === msg.id || msg.id === activeSearchMessageId
                      }
                    />
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
              {formatNewMessagesBadgeCount(newBelowCount)}
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
