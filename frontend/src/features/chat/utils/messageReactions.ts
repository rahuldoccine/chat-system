import type { Message } from '../types';

type MessagesCache = { pages: Array<{ data: Message[] }> };

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
      data: page.data.map((m) => {
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
      }),
    })),
  };
}
