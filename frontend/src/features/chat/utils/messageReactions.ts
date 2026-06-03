import type { Message } from '../types';
import type { InfiniteData } from '@tanstack/react-query';
import type { MessagePage, ThreadMessagesCache } from './messageQueryCache';

export type MessagesInfiniteCache = InfiniteData<MessagePage>;

function addReactionRow(
  summary: NonNullable<Message['reactionsSummary']>,
  emoji: string,
  isMine: boolean,
): NonNullable<Message['reactionsSummary']> {
  const idx = summary.findIndex((r) => r.emoji === emoji);
  if (idx < 0) {
    return [...summary, { emoji, count: 1, byMe: isMine }];
  }
  const row = summary[idx];
  if (isMine && row.byMe) return summary;
  const next = [...summary];
  next[idx] = { emoji, count: row.count + 1, byMe: isMine || row.byMe };
  return next;
}

function removeReactionRow(
  summary: NonNullable<Message['reactionsSummary']>,
  emoji: string,
  isMine: boolean,
): NonNullable<Message['reactionsSummary']> {
  const idx = summary.findIndex((r) => r.emoji === emoji);
  if (idx < 0) return summary;
  const row = summary[idx];
  if (isMine && !row.byMe) return summary;
  if (row.count <= 1) {
    return summary.filter((_, i) => i !== idx);
  }
  const next = [...summary];
  next[idx] = { emoji, count: row.count - 1, byMe: isMine ? false : row.byMe };
  return next;
}

function patchReactionsOnMessage(
  m: Message,
  messageId: string,
  emoji: string,
  mode: 'add' | 'remove',
  isMine: boolean,
): Message {
  if (m.id !== messageId) return m;
  const base = m.reactionsSummary ?? [];
  const summary = mode === 'add' ? addReactionRow(base, emoji, isMine) : removeReactionRow(base, emoji, isMine);
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
  old: MessagesInfiniteCache | undefined,
  messageId: string,
  emoji: string,
  mode: 'add' | 'remove',
  actorUserId: string,
  viewerId: string,
): MessagesInfiniteCache | undefined {
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
