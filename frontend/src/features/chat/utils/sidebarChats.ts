import type { Chat } from '../types';

/** Hidden from the DM list until a new message arrives (Slack-style close). */
export function isDmClosedInSidebar(chat: Chat): boolean {
  return Boolean(chat.closedAt) && chat.unreadCount === 0;
}

export function splitDirectChats(dms: Chat[]) {
  const favorites = dms.filter((c) => c.favoritedAt);
  const directMessages = dms.filter((c) => !c.favoritedAt && !isDmClosedInSidebar(c));
  return { favorites, directMessages };
}

export function splitSidebarChats(channels: Chat[], dms: Chat[]) {
  const favoriteChannels = channels.filter((c) => c.favoritedAt);
  const favoriteDms = dms.filter((c) => c.favoritedAt);
  const favorites = [...favoriteChannels, ...favoriteDms];
  const openChannels = channels.filter((c) => !c.favoritedAt);
  const { directMessages } = splitDirectChats(dms);
  return { favorites, openChannels, directMessages };
}
