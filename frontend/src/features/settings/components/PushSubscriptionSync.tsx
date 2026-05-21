import React, { useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useAppSettings } from '../hooks/useUserSettings';
import { ensureWebPushSubscription } from '../../../services/push';

/**
 * Re-register Web Push when the user has notifyPush on but the browser subscription was cleared.
 */
const PushSubscriptionSync: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { data: appSettings } = useAppSettings(isAuthenticated && !isLoading);

  useEffect(() => {
    if (!isAuthenticated || isLoading || !appSettings?.notifyPush) return;
    void ensureWebPushSubscription();
  }, [isAuthenticated, isLoading, appSettings?.notifyPush]);

  return null;
};

export default PushSubscriptionSync;
