import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './config/queryClient';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { CallProvider } from './features/calls/CallProvider';
import { ChatProvider } from './context/ChatContext';
import ProfileSyncListener from './features/settings/components/ProfileSyncListener';
import PushSubscriptionSync from './features/settings/components/PushSubscriptionSync';
import NotificationContextSync from './features/chat/components/NotificationContextSync';
import ReceiptStatusSync from './features/chat/components/ReceiptStatusSync';
import AuthChatCacheSync from './features/chat/components/AuthChatCacheSync';
import ConversationRealtimeSync from './features/chat/components/ConversationRealtimeSync';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <CallProvider>
            <ChatProvider>
              <ProfileSyncListener />
              <PushSubscriptionSync />
              <NotificationContextSync />
              <ReceiptStatusSync />
              <AuthChatCacheSync />
              <ConversationRealtimeSync />
              <App />
            </ChatProvider>
            </CallProvider>
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
