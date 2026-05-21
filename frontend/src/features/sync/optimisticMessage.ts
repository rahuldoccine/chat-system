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
    receiptStatus: 'sent',
    status: 'sending',
  };
}
