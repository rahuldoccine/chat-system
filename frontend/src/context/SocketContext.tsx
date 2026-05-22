import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { applyBlockStatusFromSocket } from '../features/chat/hooks/useBlockStatus';
import { syncUserProfileInCaches } from '../features/settings/utils/syncProfileCaches';
import { invalidateConversationList } from '../features/chat/utils/invalidateChatCaches';
import { socketService } from '../services/socket';
import {
  broadcastSocketState,
  initTabCoordinator,
  isTabLeader,
  onTabLeadershipChange,
  shutdownTabCoordinator,
  subscribeTabSync,
} from '../features/sync/tabCoordinator';
import { probeNetworkReachable, setNetworkDown } from '../features/sync/connectivity';

interface SocketContextType {
  socket: typeof socketService;
  onlineUsers: Set<string>;
  isConnected: boolean;
  lastConnectedAt: Date | null;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { token, isAuthenticated, logout, user, applyProfile } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [lastConnectedAt, setLastConnectedAt] = useState<Date | null>(null);

  const userRef = useRef(user);
  userRef.current = user;
  const applyProfileRef = useRef(applyProfile);
  applyProfileRef.current = applyProfile;
  const logoutRef = useRef(logout);
  logoutRef.current = logout;
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const needsConversationSyncRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      socketService.disconnect();
      setIsConnected(false);
      return;
    }

    initTabCoordinator();
    needsConversationSyncRef.current = false;

    const handleConnect = () => {
      setIsConnected(true);
      setLastConnectedAt(new Date());
      setNetworkDown(false);
      broadcastSocketState(true);
      void probeNetworkReachable(true);
      if (needsConversationSyncRef.current) {
        needsConversationSyncRef.current = false;
        void invalidateConversationList(queryClientRef.current);
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setNetworkDown(true);
      broadcastSocketState(false);
      needsConversationSyncRef.current = true;
    };

    const handlePresence = (data: {
      userId: string;
      status: 'online' | 'offline';
      lastSeenAt?: string;
    }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (data.status === 'online') next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });

      queryClientRef.current.setQueryData<{ data: any[]; nextCursor: string | null }>(
        ['conversations'],
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((chat) => {
              if (chat.dmPeer && chat.dmPeer.id === data.userId) {
                return {
                  ...chat,
                  dmPeer: {
                    ...chat.dmPeer,
                    isOnline: data.status === 'online',
                    lastSeenAt: data.lastSeenAt || chat.dmPeer.lastSeenAt,
                  },
                };
              }
              return chat;
            }),
          };
        },
      );
    };

    const handleSessionRevoked = () => {
      void logoutRef.current().then(() => {
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      });
    };

    const handleBlockUpdated = (data: {
      blockerId: string;
      blockedId: string;
      blocked: boolean;
    }) => {
      const me = userRef.current?.id;
      if (!me) return;
      applyBlockStatusFromSocket(queryClientRef.current, me, data);
    };

    const handleProfileUpdated = (data: {
      userId: string;
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
    }) => {
      syncUserProfileInCaches(queryClientRef.current, {
        id: data.userId,
        displayName: data.displayName,
        username: data.username,
        avatarUrl: data.avatarUrl,
      });
      const current = userRef.current;
      if (current?.id === data.userId) {
        applyProfileRef.current({
          id: data.userId,
          email: current.email,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        });
      }
    };

    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);
    socketService.on('presence:changed', handlePresence);
    socketService.on('session:revoked', handleSessionRevoked);
    socketService.on('user:profile:updated', handleProfileUpdated);
    socketService.on('user:block:updated', handleBlockUpdated);

    const connectIfLeader = () => {
      if (isTabLeader()) {
        socketService.connect(token);
      } else {
        socketService.disconnect();
        setIsConnected(false);
      }
    };

    const nudgeReconnect = () => {
      if (!isTabLeader() || !navigator.onLine) return;
      socketService.reconnect(token);
    };

    const unsubTabSync = subscribeTabSync((msg) => {
      if (msg.type === 'SOCKET_STATE' && !isTabLeader()) {
        setIsConnected(msg.connected);
        if (msg.connected) setLastConnectedAt(new Date());
      }
    });

    const onOnline = () => {
      nudgeReconnect();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        nudgeReconnect();
      }
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    connectIfLeader();
    const unsubLeadership = onTabLeadershipChange((leader) => {
      if (leader) {
        socketService.connect(token);
      } else {
        socketService.disconnect();
        setIsConnected(false);
      }
    });

    const reconnectPoll = window.setInterval(() => {
      if (!socketService.isConnected()) {
        nudgeReconnect();
      }
    }, 15_000);

    return () => {
      window.clearInterval(reconnectPoll);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubTabSync();
      unsubLeadership();
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);
      socketService.off('presence:changed', handlePresence);
      socketService.off('session:revoked', handleSessionRevoked);
      socketService.off('user:profile:updated', handleProfileUpdated);
      socketService.off('user:block:updated', handleBlockUpdated);
      socketService.disconnect();
      shutdownTabCoordinator();
      setIsConnected(false);
    };
  }, [isAuthenticated, token]);

  return (
    <SocketContext.Provider
      value={{
        socket: socketService,
        onlineUsers,
        isConnected,
        lastConnectedAt,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
