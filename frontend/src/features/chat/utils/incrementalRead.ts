import type { Message } from '../types';
import type { ChatUnreadBoundary } from '../hooks/useChatData';

/** Sort unread ids by server snapshot order (chronological), not loaded-message lookup. */
export function sortUnreadIdsByOrder(ids: string[], chronologicalOrder: string[]): string[] {
  if (chronologicalOrder.length === 0) {
    return [...ids].sort((a, b) => a.localeCompare(b));
  }
  const rank = new Map(chronologicalOrder.map((id, index) => [id, index]));
  return [...ids].sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));
}

export function buildUnreadState(
  messageIds: string[],
  chronologicalOrder?: string[],
): ChatUnreadBoundary {
  const sorted = chronologicalOrder?.length
    ? sortUnreadIdsByOrder(messageIds, chronologicalOrder)
    : messageIds;
  return {
    count: sorted.length,
    firstMessageId: sorted[0] ?? null,
    messageIds: sorted,
  };
}

export function removeMessageIdsFromUnread(
  current: ChatUnreadBoundary | undefined,
  markedIds: string[],
  chronologicalOrder?: string[],
): ChatUnreadBoundary {
  const marked = new Set(markedIds);
  const order = chronologicalOrder?.length ? chronologicalOrder : (current?.messageIds ?? []);
  const remaining = order.filter((id) => !marked.has(id));
  return buildUnreadState(remaining, order);
}

/** Incoming messages visible in the scroll container that are still unread. */
export function getVisibleUnreadMessageIds(
  container: HTMLElement | null,
  messages: Message[] | undefined,
  viewerId: string,
  unreadIds: Set<string>,
  alreadyMarked: Set<string>,
): string[] {
  if (!container || !messages?.length) return [];

  const cRect = container.getBoundingClientRect();
  const visible: string[] = [];

  for (const msg of messages) {
    if (msg.senderId === viewerId || msg.deletedAt) continue;
    if (!unreadIds.has(msg.id) || alreadyMarked.has(msg.id)) continue;

    const el = document.getElementById(`msg-${msg.id}`);
    if (!el) continue;

    const eRect = el.getBoundingClientRect();
    const visibleTop = cRect.top + 48;
    const visibleBottom = cRect.bottom - 24;
    if (eRect.bottom > visibleTop && eRect.top < visibleBottom) {
      visible.push(msg.id);
    }
  }

  return visible;
}
