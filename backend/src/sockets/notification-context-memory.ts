/** Per-user push context: tab visibility + which chat is open in the SPA. */

export type NotificationContext = {
  tabVisible: boolean;
  activeChatId: string | null;
  updatedAt: number;
};

const contextByUser = new Map<string, NotificationContext>();

export function setNotificationContext(
  userId: string,
  tabVisible: boolean,
  activeChatId: string | null,
): void {
  contextByUser.set(userId, {
    tabVisible,
    activeChatId,
    updatedAt: Date.now(),
  });
}

export function clearNotificationContext(userId: string): void {
  contextByUser.delete(userId);
}

export function isActivelyViewingChatLocally(userId: string, chatId: string): boolean {
  const ctx = contextByUser.get(userId);
  if (!ctx) return false;
  return ctx.tabVisible && ctx.activeChatId === chatId;
}
