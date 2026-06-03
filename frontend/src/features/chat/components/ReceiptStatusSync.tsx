import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import { patchReceiptFromSocket, type ReceiptSocketPayload } from '../utils/messageReceipts';

/** Updates outgoing message ticks when recipients deliver/read (any open chat). */
const ReceiptStatusSync: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket } = useSocket();

  useEffect(() => {
    if (!user?.id) return;

    const handleReceiptDelivered = (data: ReceiptSocketPayload) => {
      patchReceiptFromSocket(queryClient, user.id, data, 'delivered');
    };

    const handleReceiptRead = (data: ReceiptSocketPayload) => {
      patchReceiptFromSocket(queryClient, user.id, data, 'read');
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
