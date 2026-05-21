import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import { patchReceiptStatusInCache } from '../utils/messageReceipts';

/** Updates outgoing message ticks when recipients deliver/read (any open chat). */
const ReceiptStatusSync: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket } = useSocket();

  useEffect(() => {
    if (!user?.id) return;

    const handleReceiptDelivered = (data: {
      chatId: string;
      messageIds: string[];
      userId: string;
    }) => {
      if (data.userId === user.id) return;
      const qk = ['messages', data.chatId] as const;
      const old = queryClient.getQueryData<Parameters<typeof patchReceiptStatusInCache>[0]>(qk);
      const { data: next, matchedCount } = patchReceiptStatusInCache(
        old,
        data.chatId,
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
      if (data.userId === user.id) return;
      const qk = ['messages', data.chatId] as const;
      const old = queryClient.getQueryData<Parameters<typeof patchReceiptStatusInCache>[0]>(qk);
      const { data: next, matchedCount } = patchReceiptStatusInCache(
        old,
        data.chatId,
        data.messageIds,
        'read',
        user.id,
      );
      queryClient.setQueryData(qk, next);
      if (matchedCount === 0 && data.messageIds.length > 0) {
        void queryClient.invalidateQueries({ queryKey: qk });
      }
    };

    socket.on('receipt:delivered', handleReceiptDelivered);
    socket.on('receipt:read', handleReceiptRead);
    return () => {
      socket.off('receipt:delivered', handleReceiptDelivered);
      socket.off('receipt:read', handleReceiptRead);
    };
  }, [socket, queryClient, user?.id]);

  return null;
};

export default ReceiptStatusSync;
