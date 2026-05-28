import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { Toaster, toast } from 'sonner';
import { queryClient } from './config/queryClient';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { CallProvider } from './features/calls/CallProvider';
import { GroupCallProvider } from './features/calls/GroupCallProvider';
import { ChatProvider } from './context/ChatContext';
import ProfileSyncListener from './features/settings/components/ProfileSyncListener';
import PushSubscriptionSync from './features/settings/components/PushSubscriptionSync';
import NotificationContextSync from './features/chat/components/NotificationContextSync';
import ReceiptStatusSync from './features/chat/components/ReceiptStatusSync';
import AuthChatCacheSync from './features/chat/components/AuthChatCacheSync';
import ConversationRealtimeSync from './features/chat/components/ConversationRealtimeSync';
import PwaInstallPrompt from './features/pwa/PwaInstallPrompt';
import App from './App';
import './index.css';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast.message('Update available', {
      description: 'A new version is ready. Refresh to update now.',
      duration: Infinity,
      action: {
        label: 'Refresh',
        onClick: () => updateSW(true),
      },
      cancel: {
        label: 'Later',
        onClick: () => {
          // no-op, user can refresh manually later
        },
      },
      id: 'pwa-update-available',
    });
  },
  onOfflineReady() {
    toast.success('Offline mode ready');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <CallProvider>
            <GroupCallProvider>
            <ChatProvider>
              <ProfileSyncListener />
              <PushSubscriptionSync />
              <NotificationContextSync />
              <ReceiptStatusSync />
              <AuthChatCacheSync />
              <ConversationRealtimeSync />
              <PwaInstallPrompt />
              <Toaster position="top-center" richColors />
              <App />
            </ChatProvider>
            </GroupCallProvider>
            </CallProvider>
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
