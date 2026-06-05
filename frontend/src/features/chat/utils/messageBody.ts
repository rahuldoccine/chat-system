import { useMemo } from 'react';
import type { Message, LinkPreviewMeta } from '../types';

export type DecryptedBody = {
  text: string;
  preview?: LinkPreviewMeta;
  meta?: Record<string, unknown>;
};

export function useMessageBodies(
  messages: Message[] | undefined,
): Record<string, DecryptedBody> {
  return useMemo(() => {
    if (!messages?.length) return {};
    const out: Record<string, DecryptedBody> = {};
    for (const msg of messages) {
      out[msg.id] = {
        text: msg.ciphertext ?? '',
        preview: msg.contentMeta?.preview,
      };
    }
    return out;
  }, [messages]);
}

export function getMessageDisplayBody(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
  _userId?: string,
  _keysLocked?: boolean,
): string {
  return bodies[msg.id]?.text ?? msg.ciphertext ?? '';
}

export function getMessageLinkPreview(
  msg: Message,
  bodies: Record<string, DecryptedBody>,
): LinkPreviewMeta | undefined {
  return bodies[msg.id]?.preview ?? msg.contentMeta?.preview;
}

export function getDecryptedTransportMeta(
  _msg: Message,
  _bodies: Record<string, DecryptedBody>,
): Record<string, unknown> | undefined {
  return undefined;
}

export type PlainPollPayload = {
  question: string;
  options: Array<{ label: string; sortOrder?: number }>;
};

export function getDecryptedPollMeta(
  _msg: Message,
  _bodies: Record<string, DecryptedBody>,
  _userId: string,
): PlainPollPayload | null {
  return null;
}

export function messageWithDecryptedMeta(msg: Message): Message {
  return msg;
}
