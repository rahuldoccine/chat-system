import api from '../../../api/axios';

export async function patchChatPin(chatId: string, pinned: boolean): Promise<void> {
  await api.patch(`/chats/${chatId}/pin`, { pinned });
}

export async function patchChatFavorite(chatId: string, favorited: boolean): Promise<void> {
  await api.patch(`/chats/${chatId}/favorite`, { favorited });
}

export async function patchChatClose(chatId: string, closed: boolean): Promise<void> {
  await api.patch(`/chats/${chatId}/close`, { closed });
}
