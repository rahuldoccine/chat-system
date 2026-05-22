import React, { useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useAppSettings } from '../hooks/useUserSettings';
import {
  ensureWebPushSubscription,
  getActivePushSubscription,
  getBrowserNotificationPermission,
  isWebPushSupported,
  registerWebPush,
} from '../../../services/push';

const PROMPT_SESSION_KEY = 'chat-push-setup-prompted';

/**
 * Keeps Web Push registered when notifyPush is on: re-subscribes if cleared,
 * and prompts for browser permission once per session when still "default".
 */
const PushSubscriptionSync: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { data: appSettings } = useAppSettings(isAuthenticated && !isLoading);

  useEffect(() => {
    if (!isAuthenticated || isLoading || !appSettings?.notifyPush) return;
    if (!isWebPushSupported()) return;

    const run = async () => {
      const permission = getBrowserNotificationPermission();
      if (permission === 'granted') {
        await ensureWebPushSubscription();
        return;
      }
      if (permission !== 'default') return;

      const existing = await getActivePushSubscription();
      if (existing) {
        await ensureWebPushSubscription();
        return;
      }
      if (sessionStorage.getItem(PROMPT_SESSION_KEY)) return;
      sessionStorage.setItem(PROMPT_SESSION_KEY, '1');
      await registerWebPush();
    };

    void run();
  }, [isAuthenticated, isLoading, appSettings?.notifyPush]);

  return null;
};

export default PushSubscriptionSync;
