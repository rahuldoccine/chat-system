import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { applyUnreadStateToCaches, markThreadAsRead } from '../utils/messageReceipts';

/**
 * Marks thread-only replies as read when the user views a thread panel.
 * Re-runs when `triggerKey` changes (e.g. new replies while the panel is open).
 */
export function useMarkThreadAsRead(
  chatId: string | null,
  rootMessageId: string | null,
  enabled: boolean,
  triggerKey?: string | number,
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !chatId || !rootMessageId) return;

    let cancelled = false;
    void markThreadAsRead(chatId, rootMessageId).then((unread) => {
      if (cancelled) return;
      if (unread) {
        applyUnreadStateToCaches(queryClient, chatId, unread);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['chatUnread', chatId] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chatId, rootMessageId, enabled, triggerKey, queryClient]);
}
