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
  const { activeId, activeSection } = useChat();

  const publish = useCallback(() => {
    if (!isAuthenticated) return;
    const socket = socketService.getSocket();
    if (!socket?.connected) return;
    const tabVisible = document.visibilityState === 'visible';
    const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : tabVisible;
    const viewingMessages = activeSection === 'messages';
    socketService.emit('notification:context', {
      tabVisible,
      // Suppress push only when this tab is focused on the Messages view for that chat.
      activeChatId: tabVisible && hasFocus && viewingMessages ? activeId : null,
    });
  }, [isAuthenticated, activeId, activeSection]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const onConnect = () => publish();
    const onVisible = () => publish();
    const onFocus = () => publish();
    const onBlur = () => publish();

    socketService.on('connect', onConnect);
    document.addEventListener('visibilitychange', onVisible);
    globalThis.addEventListener('focus', onFocus);
    globalThis.addEventListener('blur', onBlur);
    publish();

    const heartbeat = globalThis.setInterval(() => publish(), 45_000);

    return () => {
      socketService.off('connect', onConnect);
      document.removeEventListener('visibilitychange', onVisible);
      globalThis.removeEventListener('focus', onFocus);
      globalThis.removeEventListener('blur', onBlur);
      globalThis.clearInterval(heartbeat);
    };
  }, [isAuthenticated, publish]);

  useEffect(() => {
    publish();
  }, [activeId, publish]);

  return null;
};

export default NotificationContextSync;
