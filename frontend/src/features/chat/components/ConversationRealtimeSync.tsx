import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { useSocket } from '../../../context/SocketContext';
import type { Message, PollDetail } from '../types';
import { mergeMessageIntoInfiniteCache } from '../hooks/useChatData';
import { applyIncomingMessageToConversations } from '../utils/conversationCache';
import type { ChatUnreadBoundary } from '../hooks/useChatData';
import {
  ackIncomingMessages,
  applyChatReadToCaches,
  applyUnreadStateToCaches,
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
  const { activeId } = useChat();
  const { socket } = useSocket();

  useEffect(() => {
    if (!user?.id) return;

    const handleNewMessage = (data: { chatId: string; message: Message }) => {
      queryClient.setQueryData(['messages', data.chatId], (old) =>
        mergeMessageIntoInfiniteCache(
          old as Parameters<typeof mergeMessageIntoInfiniteCache>[0],
          data.message,
        ) ?? old,
      );

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
    socket.on('receipt:read', handleReceiptRead);
    socket.on('poll:updated', handlePollUpdated);
    return () => {
      unsubTab();
      socket.off('connect', handleConnect);
      socket.off('message:new', handleNewMessage);
      socket.off('receipt:read', handleReceiptRead);
      socket.off('poll:updated', handlePollUpdated);
    };
  }, [socket, queryClient, user?.id, activeId]);

  return null;
};

export default ConversationRealtimeSync;
