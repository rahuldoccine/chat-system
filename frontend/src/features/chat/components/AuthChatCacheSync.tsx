import React, { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import {
  clearChatSessionCaches,
  invalidateConversationList,
} from '../utils/invalidateChatCaches';

/** Keeps conversation/unread caches aligned with the active auth session. */
const AuthChatCacheSync: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const nextUserId = user?.id ?? null;

    if (!nextUserId) {
      if (previousUserId) {
        clearChatSessionCaches(queryClient);
      }
      previousUserIdRef.current = null;
      return;
    }

    if (previousUserId !== nextUserId) {
      void invalidateConversationList(queryClient);
    }

    previousUserIdRef.current = nextUserId;
  }, [queryClient, user?.id]);

  return null;
};

export default AuthChatCacheSync;
