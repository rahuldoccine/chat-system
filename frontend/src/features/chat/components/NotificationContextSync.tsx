import React, { useCallback, useEffect } from 'react';
import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import { socketService } from '../../../services/socket';

/**
 * Tells the server when the browser tab is visible and which chat is open,
 * so Web Push is still sent when the user is on home or another tab.
 */
const NotificationContextSync: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { activeId } = useChat();

  const publish = useCallback(() => {
    if (!isAuthenticated) return;
    const socket = socketService.getSocket();
    if (!socket?.connected) return;
    socketService.emit('notification:context', {
      tabVisible: document.visibilityState === 'visible',
      activeChatId: activeId,
    });
  }, [isAuthenticated, activeId]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const onConnect = () => publish();
    const onVisible = () => publish();

    socketService.on('connect', onConnect);
    document.addEventListener('visibilitychange', onVisible);
    publish();

    return () => {
      socketService.off('connect', onConnect);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, publish]);

  useEffect(() => {
    publish();
  }, [activeId, publish]);

  return null;
};

export default NotificationContextSync;
