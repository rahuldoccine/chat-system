import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { useSocket } from '../../../context/SocketContext';
import type { Message, PollDetail } from '../types';
import {
  applyIncomingMessageToAllCaches,
  applyThreadUpdatedToMainCache,
  threadMessagesQueryKey,
} from '../utils/messageQueryCache';
import { applyIncomingMessageToConversations } from '../utils/conversationCache';
import type { ChatUnreadBoundary } from '../hooks/useChatData';
import {
  ackIncomingMessages,
  applyChatReadToCaches,
  applyUnreadStateToCaches,
  markThreadAsRead,
} from '../utils/messageReceipts';
import { removeMessageIdsFromUnread } from '../utils/incrementalRead';
import { syncOnReconnect } from '../../sync/syncOnReconnect';
import {
  broadcastOutboxFlushed,
  subscribeTabSync,
} from '../../sync/tabCoordinator';

/** Keeps sidebar unread counts and previews in sync with socket events. */
const ConversationRealtimeSync: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeId, activeThreadRootId } = useChat();
  const { socket } = useSocket();

  useEffect(() => {
    if (!user?.id) return;

    const handleNewMessage = (data: { chatId: string; message: Message }) => {
      applyIncomingMessageToAllCaches(queryClient, data.message);
      if (data.message.threadRootId) {
        void queryClient.invalidateQueries({
          queryKey: threadMessagesQueryKey(data.chatId, data.message.threadRootId),
        });
        const isThreadOnly = !data.message.broadcastToChannel;
        const viewingThread =
          data.chatId === activeId &&
          activeThreadRootId === data.message.threadRootId &&
          data.message.senderId !== user.id;
        if (isThreadOnly && viewingThread) {
          void markThreadAsRead(data.chatId, data.message.threadRootId).then((unread) => {
            if (unread) applyUnreadStateToCaches(queryClient, data.chatId, unread);
          });
        }
      }

      let found = false;
      queryClient.setQueryData(['conversations'], (old) => {
        const next = applyIncomingMessageToConversations(
          old as Parameters<typeof applyIncomingMessageToConversations>[0],
          {
            chatId: data.chatId,
            message: data.message,
            viewerId: user.id,
            activeChatId: activeId,
          },
        );
        if (next !== old) found = true;
        return next;
      });
      if (!found) {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }

      if (data.message.senderId !== user.id && !data.message.deletedAt) {
        void ackIncomingMessages(data.chatId, [data.message], user.id);
      }
    };

    const handleReceiptRead = (data: {
      chatId: string;
      userId: string;
      messageIds?: string[];
    }) => {
      if (data.userId !== user.id) return;

      if (data.messageIds?.length) {
        const current = queryClient.getQueryData<ChatUnreadBoundary>(['chatUnread', data.chatId]);
        const next = removeMessageIdsFromUnread(current, data.messageIds, current?.messageIds);
        applyUnreadStateToCaches(queryClient, data.chatId, next);
      } else {
        applyChatReadToCaches(queryClient, data.chatId);
      }
    };

    const handleThreadUpdated = (data: {
      chatId: string;
      rootMessageId: string;
      replyCount: number;
      lastReplyAt: string;
    }) => {
      applyThreadUpdatedToMainCache(queryClient, data);
    };

    const handlePollUpdated = (data: { pollId?: string; poll?: PollDetail }) => {
      if (!data.pollId) return;
      if (data.poll) {
        queryClient.setQueryData(['poll', data.pollId], data.poll);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['poll', data.pollId] });
      }
    };

    const handleConnect = () => {
      void syncOnReconnect(queryClient, activeId).then(() => {
        broadcastOutboxFlushed();
      });
    };

    const handleBrowserOnline = () => {
      void syncOnReconnect(queryClient, activeId).then(() => {
        broadcastOutboxFlushed();
      });
    };

    const unsubTab = subscribeTabSync((msg) => {
      if (msg.type === 'READ_STATE' && msg.chatId) {
        applyChatReadToCaches(queryClient, msg.chatId);
      }
      if (msg.type === 'OUTBOX_FLUSHED') {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    });

    socket.on('connect', handleConnect);
    socket.on('message:new', handleNewMessage);
    socket.on('thread:updated', handleThreadUpdated);
    socket.on('receipt:read', handleReceiptRead);
    socket.on('poll:updated', handlePollUpdated);
    globalThis.addEventListener('online', handleBrowserOnline);
    return () => {
      unsubTab();
      globalThis.removeEventListener('online', handleBrowserOnline);
      socket.off('connect', handleConnect);
      socket.off('message:new', handleNewMessage);
      socket.off('thread:updated', handleThreadUpdated);
      socket.off('receipt:read', handleReceiptRead);
      socket.off('poll:updated', handlePollUpdated);
    };
  }, [socket, queryClient, user?.id, activeId, activeThreadRootId]);

  return null;
};

export default ConversationRealtimeSync;
