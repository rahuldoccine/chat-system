import { formatMessageDateDividerLabel, toDateKey } from '../../../utils/timeFormat';
import type { Message } from '../types';

export type DateStreamItem = {
  type: 'date';
  key: string;
  label: string;
};

export type UnreadDividerStreamItem = {
  type: 'unread';
  key: string;
  count: number;
};

export type MessageStreamItem = {
  type: 'message';
  message: Message;
};

export type StreamItem = DateStreamItem | UnreadDividerStreamItem | MessageStreamItem;

export type UnreadDividerOptions = {
  count: number;
  beforeMessageId: string;
};

export function formatUnreadDividerLabel(count: number): string {
  return count === 1 ? '1 Unread Message' : `${count} Unread Messages`;
}

/** First loaded message that should have the unread divider above it. */
export function resolveUnreadDividerBeforeId(
  messages: Message[],
  divider: UnreadDividerOptions,
  unreadIds?: ReadonlySet<string>,
): string {
  if (messages.some((m) => m.id === divider.beforeMessageId)) {
    return divider.beforeMessageId;
  }
  if (unreadIds?.size) {
    const firstUnreadInView = messages.find((m) => unreadIds.has(m.id));
    if (firstUnreadInView) return firstUnreadInView.id;
  }
  return divider.beforeMessageId;
}

export function buildMessageStreamItems(
  messages: Message[],
  unreadDivider?: UnreadDividerOptions | null,
  unreadIds?: ReadonlySet<string>,
): StreamItem[] {
  const items: StreamItem[] = [];
  let lastDateKey = '';
  let unreadPlaced = false;

  const insertBeforeId =
    unreadDivider && unreadDivider.count > 0
      ? resolveUnreadDividerBeforeId(messages, unreadDivider, unreadIds)
      : null;

  for (const msg of messages) {
    const dateKey = toDateKey(msg.createdAt);

    if (dateKey !== lastDateKey) {
      items.push({
        type: 'date',
        key: dateKey,
        label: formatMessageDateDividerLabel(msg.createdAt),
      });
      lastDateKey = dateKey;
    }

    if (insertBeforeId && !unreadPlaced && msg.id === insertBeforeId) {
      items.push({
        type: 'unread',
        key: 'unread-divider',
        count: unreadDivider!.count,
      });
      unreadPlaced = true;
    }

    items.push({ type: 'message', message: msg });
  }

  return items;
}
