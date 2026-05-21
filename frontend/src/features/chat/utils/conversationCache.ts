import type { Chat, Message } from '../types';
import { getMessagePreviewText } from './messagePreview';

export type ConversationsCache = { data: Chat[]; nextCursor: string | null };

function lastMessagePreview(message: Message): string {
  return getMessagePreviewText(message);
}

export function clearConversationUnread(
  old: ConversationsCache | undefined,
  chatId: string,
): ConversationsCache | undefined {
  return patchConversationUnreadCount(old, chatId, 0);
}

export function patchConversationUnreadCount(
  old: ConversationsCache | undefined,
  chatId: string,
  unreadCount: number,
): ConversationsCache | undefined {
  if (!old?.data) return old;
  return {
    ...old,
    data: old.data.map((chat) =>
      chat.id === chatId ? { ...chat, unreadCount: Math.max(0, unreadCount) } : chat,
    ),
  };
}

export function applyIncomingMessageToConversations(
  old: ConversationsCache | undefined,
  params: {
    chatId: string;
    message: Message;
    viewerId: string;
    activeChatId: string | null;
  },
): ConversationsCache | undefined {
  if (!old?.data) return old;

  const { chatId, message, viewerId, activeChatId } = params;
  const isIncoming = message.senderId !== viewerId;
  const isViewingChat = chatId === activeChatId;

  let found = false;
  const data = old.data.map((chat) => {
    if (chat.id !== chatId) return chat;
    found = true;
    const unreadCount =
      isViewingChat || !isIncoming
        ? 0
        : chat.unreadCount + 1;
    return {
      ...chat,
      unreadCount,
      lastMessage: {
        ciphertext: lastMessagePreview(message),
        createdAt: message.createdAt,
      },
      updatedAt: message.createdAt,
    };
  });

  if (!found) return old;

  const idx = data.findIndex((c) => c.id === chatId);
  if (idx > 0) {
    const [chat] = data.splice(idx, 1);
    data.unshift(chat);
  }

  return { ...old, data };
}
