import type { Message } from '../chat/types';

type AuthUser = {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
};

export type BuildOptimisticInput = {
  clientMessageId: string;
  chatId: string;
  text?: string;
  replyToId?: string;
  threadRootId?: string | null;
  broadcastToChannel?: boolean;
  kind?: Message['kind'];
  contentMeta?: Message['contentMeta'];
};

export function buildOptimisticMessage(user: AuthUser, input: BuildOptimisticInput): Message {
  const now = new Date().toISOString();
  return {
    id: input.clientMessageId,
    clientMessageId: input.clientMessageId,
    chatId: input.chatId,
    senderId: user.id,
    sender: {
      id: user.id,
      email: user.email,
      displayName: user.name,
      name: user.name,
      avatarUrl: user.avatar ?? undefined,
    },
    ciphertext: input.text ?? '',
    createdAt: now,
    kind: input.kind ?? 'TEXT',
    contentMeta: input.contentMeta,
    replyToId: input.replyToId ?? null,
    threadRootId: input.threadRootId ?? null,
    broadcastToChannel: input.broadcastToChannel ?? false,
    receiptStatus: 'sent',
    status: 'sending',
  };
}
