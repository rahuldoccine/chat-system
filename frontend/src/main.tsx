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
import { ThemeProvider } from './context/ThemeContext';
import AppSyncEffects from './components/AppSyncEffects';
import PwaInstallPrompt from './features/pwa/PwaInstallPrompt';
import App from './App';
import { applyThemeFromStorage } from './themeBootstrap';
import './index.css';

applyThemeFromStorage();

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

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <CallProvider>
            <GroupCallProvider>
            <ChatProvider>
              <AppSyncEffects />
              <PwaInstallPrompt />
              <Toaster position="top-center" richColors />
              <App />
            </ChatProvider>
            </GroupCallProvider>
            </CallProvider>
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
