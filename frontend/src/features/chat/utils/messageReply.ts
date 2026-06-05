import type { Message, ReplyPreview } from '../types';
import type { DecryptedBody } from './messageBody';
import { replyPreviewLabel as previewLabel } from './messagePreview';

export function toReplyPreview(message: Message): ReplyPreview {
  return {
    id: message.id,
    senderId: message.senderId,
    kind: message.kind,
    ciphertext: message.ciphertext ?? null,
    contentMeta: message.contentMeta,
    sender: message.sender
      ? {
          id: message.sender.id,
          displayName: message.sender.displayName,
          email: message.sender.email,
        }
      : undefined,
  };
}

export function enrichMessageWithReply(message: Message, knownMessages: Message[]): Message {
  if (message.replyTo || !message.replyToId) return message;
  const parent = knownMessages.find((m) => m.id === message.replyToId);
  if (!parent) return message;
  return { ...message, replyTo: toReplyPreview(parent) };
}

export function replyPreviewLabel(
  reply: ReplyPreview,
  bodies?: Record<string, DecryptedBody>,
  userId?: string,
): string {
  return previewLabel(reply, bodies, userId);
}

export function replyPreviewAuthor(reply: ReplyPreview, viewerId?: string): string {
  if (reply.senderId === viewerId) return 'You';
  return reply.sender?.displayName || reply.sender?.email || 'User';
}
