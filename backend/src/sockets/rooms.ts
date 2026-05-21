export const SOCKET_CHAT_PREFIX = "chat:" as const;
export const SOCKET_USER_PREFIX = "user:" as const;

export function roomChat(chatId: string): string {
  return `${SOCKET_CHAT_PREFIX}${chatId}`;
}

export function roomUser(userId: string): string {
  return `${SOCKET_USER_PREFIX}${userId}`;
}
