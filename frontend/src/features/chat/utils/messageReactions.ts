import type { Message } from '../types';
import type { ThreadMessagesCache } from './messageQueryCache';

type MessagesCache = { pages: Array<{ data: Message[] }> };

function patchReactionsOnMessage(
  m: Message,
  messageId: string,
  emoji: string,
  mode: 'add' | 'remove',
  isMine: boolean,
): Message {
  if (m.id !== messageId) return m;
  const summary = [...(m.reactionsSummary ?? [])];
  const idx = summary.findIndex((r) => r.emoji === emoji);

  if (mode === 'add') {
    if (idx >= 0) {
      const row = summary[idx];
      if (isMine && row.byMe) return m;
      summary[idx] = {
        emoji,
        count: row.count + 1,
        byMe: isMine || row.byMe,
      };
    } else {
      summary.push({ emoji, count: 1, byMe: isMine });
    }
  } else if (idx >= 0) {
    const row = summary[idx];
    if (isMine && !row.byMe) return m;
    if (row.count <= 1) {
      summary.splice(idx, 1);
    } else {
      summary[idx] = {
        emoji,
        count: row.count - 1,
        byMe: isMine ? false : row.byMe,
      };
    }
  }

  return { ...m, reactionsSummary: summary };
}

export function patchReactionOnThreadCache(
  old: ThreadMessagesCache | undefined,
  messageId: string,
  emoji: string,
  mode: 'add' | 'remove',
  actorUserId: string,
  viewerId: string,
): ThreadMessagesCache | undefined {
  if (!old) return old;
  const isMine = actorUserId === viewerId;
  return {
    ...old,
    root: patchReactionsOnMessage(old.root, messageId, emoji, mode, isMine),
    replies: old.replies.map((m) => patchReactionsOnMessage(m, messageId, emoji, mode, isMine)),
  };
}

export function patchReactionOnMessage(
  old: MessagesCache | undefined,
  messageId: string,
  emoji: string,
  mode: 'add' | 'remove',
  actorUserId: string,
  viewerId: string,
): MessagesCache | undefined {
  if (!old) return old;

  const isMine = actorUserId === viewerId;

  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      data: page.data.map((m) => patchReactionsOnMessage(m, messageId, emoji, mode, isMine)),
    })),
  };
}
