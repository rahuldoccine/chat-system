import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { Chat } from '../chat/types';
import { isGroupE2eeChat } from './chatE2ee';
import { fetchGroupSenderKeys } from './groupSenderKeys';

/** Prefetch group sender keys when opening a GROUP_V1 chat. */
export function useE2eeChatPrefetch(chatId: string | null, chat: Chat | null | undefined): void {
  const { user, e2eeKeysLocked } = useAuth();

  useEffect(() => {
    if (!user?.id || !chatId || !chat || e2eeKeysLocked) return;
    if (!isGroupE2eeChat(chat)) return;
    void fetchGroupSenderKeys(chatId, user.id);
  }, [chat, chatId, e2eeKeysLocked, user?.id]);
}
