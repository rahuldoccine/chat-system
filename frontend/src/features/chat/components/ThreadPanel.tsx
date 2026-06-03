import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, MessageSquare, ExternalLink, ArrowLeft } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import {
  useThreadMessages,
  useAddReaction,
  useRemoveReaction,
  useDeleteMessage,
  usePinnedMessages,
  useConversations,
} from '../hooks/useChatData';
import { fetchGroup } from '../api/groupsApi';
import { canModerateMessages } from '../utils/groupRoles';
import {
  useMessageBodies,
  getMessageDisplayBody,
} from '../../e2ee/useMessageBodies';
import type { Message } from '../types';
import MessageComposer from './MessageComposer';
import ThreadMessageRow from './ThreadMessageRow';
import type { MessageMenuAction } from './MessageOptionsMenu';
import ConfirmModal from './ConfirmModal';
import { patchReactionOnThreadCache } from '../utils/messageReactions';
import { threadMessagesQueryKey, type ThreadMessagesCache } from '../utils/messageQueryCache';
import { useMarkThreadAsRead } from '../hooks/useMarkThreadAsRead';
import styles from './ThreadPanel.module.css';
import streamStyles from './MessageStream.module.css';

const ThreadPanel: React.FC = () => {
  const {
    activeId,
    activeThreadRootId,
    closeThread,
    requestScrollToMessage,
    setEditingMessage,
    setThreadReplyingTo,
  } = useChat();
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevReplyCountRef = useRef(0);

  const { data, isLoading, isFetching, isError } = useThreadMessages(activeId, activeThreadRootId);
  useMarkThreadAsRead(
    activeId,
    activeThreadRootId,
    Boolean(data?.root),
    data?.replies?.length ?? 0,
  );
  const { data: pinsData } = usePinnedMessages(activeId);
  const { data: conversationsData } = useConversations();
  const activeChat = conversationsData?.data?.find((c) => c.id === activeId);
  const isDirectChat = activeChat?.type === 'DIRECT';
  const { data: groupDetails } = useQuery({
    queryKey: ['group', activeId],
    queryFn: () => {
      if (!activeId) throw new Error('activeId required');
      return fetchGroup(activeId);
    },
    enabled: Boolean(activeId && activeChat?.type === 'GROUP'),
  });
  const canPinInThread = isDirectChat || Boolean(groupDetails && canModerateMessages(groupDetails.myRole));

  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const { mutate: addReaction } = useAddReaction();
  const { mutate: removeReaction } = useRemoveReaction();
  const { mutate: deleteMessage, isPending: isDeleting } = useDeleteMessage();

  const pinnedIds = useMemo(
    () => new Set((pinsData?.data ?? []).map((p) => p.messageId)),
    [pinsData],
  );

  const allMessages = useMemo(() => {
    if (!data?.root) return [];
    return [data.root, ...(data.replies ?? [])];
  }, [data]);

  const decryptedBodies = useMessageBodies(allMessages);
  const replyCount = data?.replies?.length ?? 0;
  const threadData = data as { root: Message | null; replies: Message[] } | undefined;
  const showLoadingOverlay = isLoading && (threadData?.root ?? null) === null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = gap < 48;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [activeThreadRootId]);

  useEffect(() => {
    if (replyCount > prevReplyCountRef.current && stickToBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    prevReplyCountRef.current = replyCount;
  }, [replyCount, activeThreadRootId]);

  useEffect(() => {
    prevReplyCountRef.current = 0;
    stickToBottomRef.current = true;
    const el = scrollRef.current;
    if (el && data?.replies?.length) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [activeThreadRootId]);

  useEffect(() => {
    if (!activeId || !activeThreadRootId) return;

    const patchThreadReactions = (
      messageId: string,
      emoji: string,
      op: 'add' | 'remove',
      actorUserId: string,
    ) => {
      queryClient.setQueryData<ThreadMessagesCache>(
        threadMessagesQueryKey(activeId, activeThreadRootId),
        (old) =>
          patchReactionOnThreadCache(old, messageId, emoji, op, actorUserId, user?.id ?? ''),
      );
    };

    const onAdded = (payload: {
      chatId: string;
      messageId: string;
      emoji: string;
      userId: string;
    }) => {
      if (payload.chatId !== activeId) return;
      patchThreadReactions(payload.messageId, payload.emoji, 'add', payload.userId);
    };

    const onRemoved = (payload: {
      chatId: string;
      messageId: string;
      emoji: string;
      userId: string;
    }) => {
      if (payload.chatId !== activeId) return;
      patchThreadReactions(payload.messageId, payload.emoji, 'remove', payload.userId);
    };

    socket.on('reaction:added', onAdded);
    socket.on('reaction:removed', onRemoved);
    return () => {
      socket.off('reaction:added', onAdded);
      socket.off('reaction:removed', onRemoved);
    };
  }, [activeId, activeThreadRootId, queryClient, socket, user?.id]);

  const handleViewInChat = useCallback(() => {
    if (!activeThreadRootId) return;
    requestScrollToMessage(activeThreadRootId);
  }, [activeThreadRootId, requestScrollToMessage]);

  const handleMenuAction = useCallback(
    (msg: Message, action: MessageMenuAction) => {
      if (!activeId) return;
      switch (action) {
        case 'edit':
          setEditingMessage({
            id: msg.id,
            text: getMessageDisplayBody(msg, decryptedBodies, user?.id ?? '') || '',
          });
          break;
        case 'delete':
          setDeleteTarget(msg);
          break;
        case 'copy':
          break;
        default:
          break;
      }
    },
    [activeId, decryptedBodies, setEditingMessage, user?.id],
  );

  const handleReactionPick = useCallback(
    (messageId: string, emoji: string) => {
      if (!activeId) return;
      const msg = allMessages.find((m) => m.id === messageId);
      const alreadyMine = msg?.reactionsSummary?.some((r) => r.emoji === emoji && r.byMe);
      if (alreadyMine) {
        removeReaction({ chatId: activeId, messageId, emoji });
      } else {
        addReaction({ chatId: activeId, messageId, emoji });
      }
    },
    [activeId, addReaction, allMessages, removeReaction],
  );

  const root = data?.root;

  if (!activeId || !activeThreadRootId) return null;

  return (
    <aside className={styles.panel} aria-label="Thread">
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={closeThread}
            aria-label="Back to chat"
          >
            <ArrowLeft size={20} />
          </button>
          <MessageSquare size={18} className={styles.headerIcon} aria-hidden />
          <div>
            <h3 className={styles.title}>Thread</h3>
            {replyCount > 0 && (
              <span className={styles.subtitle}>
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </span>
            )}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.viewInChatBtn}
            onClick={handleViewInChat}
            title="View parent in main chat"
          >
            <ExternalLink size={14} />
            <span>View in chat</span>
          </button>
          <button type="button" className={styles.closeBtn} onClick={closeThread} aria-label="Close thread">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className={styles.scrollArea} ref={scrollRef}>
        {showLoadingOverlay && (
          <div className={styles.loading}>
            <Loader2 className={streamStyles.spinner} size={20} />
          </div>
        )}
        {isError && !root && (
          <p className={styles.errorText}>Could not load thread. Try closing and reopening.</p>
        )}

        {root && (
          <div className={styles.scrollInner}>
            <section className={styles.parentSection} aria-label="Thread parent message">
              <p className={styles.parentLabel}>Thread started by</p>
              <div className={styles.parentCard}>
                <div className={styles.parentRootRow}>
                  <ThreadMessageRow
                    msg={root}
                    isMe={root.senderId === user?.id}
                    isDirectChat={Boolean(isDirectChat)}
                    canPin={canPinInThread}
                    viewerId={user?.id}
                    bodies={decryptedBodies}
                    isPinned={pinnedIds.has(root.id)}
                    onReply={() => setThreadReplyingTo(root.id)}
                    onMenuAction={(action) => handleMenuAction(root, action)}
                    onReactionPick={(emoji) => handleReactionPick(root.id, emoji)}
                  />
                </div>
              </div>
            </section>

            <div className={styles.divider} role="separator">
              <span>{replyCount > 0 ? 'Replies' : 'No replies yet'}</span>
            </div>

            {isFetching && !showLoadingOverlay && (
              <div className={styles.refreshHint} aria-live="polite">
                <Loader2 className={streamStyles.spinner} size={14} />
              </div>
            )}

            <div className={styles.repliesBlock}>
              {(data?.replies ?? []).map((msg) => (
                <ThreadMessageRow
                  key={msg.id}
                  msg={msg}
                  isMe={msg.senderId === user?.id}
                  isDirectChat={Boolean(isDirectChat)}
                  canPin={canPinInThread}
                  viewerId={user?.id}
                  bodies={decryptedBodies}
                  isPinned={pinnedIds.has(msg.id)}
                  onReply={() => setThreadReplyingTo(msg.id)}
                  onMenuAction={(action) => handleMenuAction(msg, action)}
                  onReactionPick={(emoji) => handleReactionPick(msg.id, emoji)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <MessageComposer variant="thread" threadRootId={activeThreadRootId} />
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete message?"
        description="This message will be removed for everyone in the chat."
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={() => {
          if (!activeId || !deleteTarget) return;
          deleteMessage(
            { chatId: activeId, messageId: deleteTarget.id },
            { onSuccess: () => setDeleteTarget(null) },
          );
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </aside>
  );
};

export default ThreadPanel;
