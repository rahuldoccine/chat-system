import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSocket } from '../../../context/SocketContext';

export function useChatTyping(activeId: string | null, currentUserId?: string) {
  const { socket } = useSocket();
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setTypingUsers({});
  }, [activeId]);

  useEffect(() => {
    const handleTyping = (data: { chatId: string; userId: string; isTyping: boolean }) => {
      if (data.chatId !== activeId || data.userId === currentUserId) return;
      setTypingUsers((prev) => ({ ...prev, [data.userId]: data.isTyping }));
    };

    socket.on('typing:update', handleTyping);
    return () => socket.off('typing:update', handleTyping);
  }, [activeId, socket, currentUserId]);

  const peerTypingIds = useMemo(
    () =>
      Object.entries(typingUsers)
        .filter(([id, typing]) => typing && id !== currentUserId)
        .map(([id]) => id),
    [typingUsers, currentUserId],
  );

  const clearTyping = useCallback((userId: string) => {
    setTypingUsers((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  return {
    peerTypingIds,
    peerTypingCount: peerTypingIds.length,
    isPeerTyping: peerTypingIds.length > 0,
    clearTyping,
  };
}
