import api from '../../api/axios';
import { socketService } from '../../services/socket';
import { friendlySocketAckMessage } from '../../utils/userFriendlyErrors';
import type { Chat, Message } from '../chat/types';
import { prepareOutboundMessage } from '../e2ee/prepareOutbound';
import { E2eePeerNotReadyError } from '../e2ee/directChat';
import { canAttemptDelivery, shouldQueueLocallyAsync } from './connectivity';
import {
  enqueueOutbox,
  listPendingOutbox,
  markOutboxFailed,
  markOutboxSending,
  removeOutbox,
  resetOutboxPending,
  type OutboxEntry,
  type OutboxPayload,
} from './outbox';

const SEND_TIMEOUT_MS = 15_000;
const SEND_ATTEMPT_MAX_MS = 5_000;
const MAX_OUTBOX_ATTEMPTS = 8;
const FLUSH_CONCURRENCY = 3;

type SocketAck =
  | { ok: true; data?: { message: Message; idempotent?: boolean } }
  | { ok: false; code?: string; message?: string };

export type SendMessageInput = {
  chatId: string;
  text?: string;
  replyToId?: string;
  threadRootId?: string | null;
  broadcastToChannel?: boolean;
  kind?: 'TEXT' | 'IMAGE' | 'FILE' | 'OTHER';
  contentMeta?: unknown;
  clientMessageId?: string;
  userId?: string;
  chat?: Pick<Chat, 'type' | 'e2eeMode' | 'dmPeer'> | null;
  peerUserId?: string;
  preferPeerDeviceId?: string | null;
  /** Skip encryption when ciphertext was prepared externally (e.g. encrypted attachments). */
  preEncrypted?: { ciphertext: string; contentMeta: unknown };
};

export { E2eePeerNotReadyError };

export type SendMessageResult = {
  message: Message;
  clientMessageId: string;
  idempotent?: boolean;
  /** True when stored in outbox only (offline / send failed). */
  queued: boolean;
};

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ('code' in err && (err as { code?: string }).code === 'ERR_NETWORK') return true;
  if ('message' in err && typeof (err as { message?: string }).message === 'string') {
    return /network|failed to fetch|offline|not_connected|timeout|econnaborted/i.test(
      (err as { message: string }).message,
    );
  }
  return false;
}

function isQueueableSendError(err: unknown): boolean {
  if (isNetworkError(err)) return true;
  if (err instanceof Error) {
    return err.message === 'offline' || err.message === 'timeout';
  }
  return false;
}

function buildQueuedResult(
  input: SendMessageInput,
  clientMessageId: string,
  body: OutboxPayload,
): SendMessageResult {
  return {
    message: {
      id: clientMessageId,
      clientMessageId,
      chatId: input.chatId,
      senderId: input.userId ?? '',
      sender: { id: input.userId ?? '', email: '' },
      ciphertext: body.ciphertext,
      createdAt: new Date().toISOString(),
      kind: body.kind,
      contentMeta: body.contentMeta as Message['contentMeta'],
      status: 'sending',
    },
    clientMessageId,
    queued: true,
  };
}

function toOutboxPayload(input: SendMessageInput, clientMessageId: string): OutboxPayload {
  return {
    clientMessageId,
    chatId: input.chatId,
    ciphertext: input.text ?? '',
    kind: input.kind ?? 'TEXT',
    replyToId: input.replyToId ?? null,
    threadRootId: input.threadRootId ?? null,
    broadcastToChannel: input.broadcastToChannel ?? false,
    contentMeta: input.contentMeta,
  };
}

function emitMessageSend(
  chatId: string,
  body: OutboxPayload,
): Promise<{ message: Message; idempotent?: boolean }> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(friendlySocketAckMessage('TIMEOUT', undefined)));
    }, SEND_TIMEOUT_MS);

    socketService.emit(
      'message:send',
      {
        chatId,
        clientMessageId: body.clientMessageId,
        kind: body.kind,
        ciphertext: body.ciphertext,
        contentMeta: body.contentMeta ?? null,
        replyToId: body.replyToId ?? null,
        threadRootId: body.threadRootId ?? null,
        broadcastToChannel: body.broadcastToChannel ?? false,
      },
      (ack: SocketAck) => {
        window.clearTimeout(timer);
        if (ack?.ok && ack.data?.message) {
          resolve({ message: ack.data.message, idempotent: ack.data.idempotent });
          return;
        }
        reject(
          new Error(
            friendlySocketAckMessage(
              ack?.ok === false ? ack.code : undefined,
              ack?.ok === false ? ack.message : undefined,
            ),
          ),
        );
      },
    );
  });
}

async function sendViaRest(body: OutboxPayload): Promise<{ message: Message; idempotent?: boolean }> {
  const response = await api.post(`/chats/${body.chatId}/messages`, {
    ciphertext: body.ciphertext,
    clientMessageId: body.clientMessageId,
    kind: body.kind,
    replyToId: body.replyToId,
    threadRootId: body.threadRootId,
    broadcastToChannel: body.broadcastToChannel,
    contentMeta: body.contentMeta,
  });
  const data = response.data as { message: Message; idempotent?: boolean };
  return { message: data.message, idempotent: data.idempotent };
}

export async function deliverOutboxEntry(entry: OutboxEntry): Promise<SendMessageResult | null> {
  if (entry.attempts >= MAX_OUTBOX_ATTEMPTS) {
    await markOutboxFailed(entry.clientMessageId);
    return null;
  }

  await markOutboxSending(entry.clientMessageId);

  try {
    let result: { message: Message; idempotent?: boolean };
    if (socketService.isConnected()) {
      result = await emitMessageSend(entry.chatId, entry);
    } else if (typeof navigator !== 'undefined' && navigator.onLine) {
      result = await sendViaRest(entry);
    } else {
      await resetOutboxPending(entry.clientMessageId);
      return null;
    }

    await removeOutbox(entry.clientMessageId);
    return {
      message: result.message,
      clientMessageId: entry.clientMessageId,
      idempotent: result.idempotent,
      queued: false,
    };
  } catch {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await resetOutboxPending(entry.clientMessageId);
      return null;
    }
    await markOutboxFailed(entry.clientMessageId);
    return null;
  }
}

let flushInFlight: Promise<void> | null = null;

export async function flushOutbox(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const pending = await listPendingOutbox();
    if (!pending.length) return;

    for (let i = 0; i < pending.length; i += FLUSH_CONCURRENCY) {
      const batch = pending.slice(i, i + FLUSH_CONCURRENCY);
      await Promise.all(batch.map((entry) => deliverOutboxEntry(entry)));
    }
  })().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function buildSendBody(
  input: SendMessageInput,
  clientMessageId: string,
  offlineMode: boolean,
): Promise<OutboxPayload> {
  if (input.preEncrypted) {
    return {
      clientMessageId,
      chatId: input.chatId,
      ciphertext: input.preEncrypted.ciphertext,
      kind: input.kind ?? 'TEXT',
      replyToId: input.replyToId ?? null,
      threadRootId: input.threadRootId ?? null,
      broadcastToChannel: input.broadcastToChannel ?? false,
      contentMeta: input.preEncrypted.contentMeta,
    };
  }
  if (input.userId) {
    const prepared = await prepareOutboundMessage(
      input.userId,
      {
        chatId: input.chatId,
        text: input.text,
        kind: input.kind,
        contentMeta: input.contentMeta,
        clientMessageId,
        chat: input.chat,
        peerUserId: input.peerUserId,
        preferPeerDeviceId: input.preferPeerDeviceId,
      },
      offlineMode,
    );
    return {
      clientMessageId,
      chatId: input.chatId,
      ciphertext: prepared.ciphertext,
      kind: input.kind ?? 'TEXT',
      replyToId: input.replyToId ?? null,
      threadRootId: input.threadRootId ?? null,
      broadcastToChannel: input.broadcastToChannel ?? false,
      contentMeta: prepared.contentMeta,
    };
  }
  return toOutboxPayload(input, clientMessageId);
}

export async function sendMessageUnified(input: SendMessageInput): Promise<SendMessageResult> {
  const clientMessageId = input.clientMessageId ?? crypto.randomUUID();
  const offlineMode = await shouldQueueLocallyAsync();
  const body = await buildSendBody(input, clientMessageId, offlineMode);
  await enqueueOutbox(body);

  if (!(await canAttemptDelivery())) {
    return buildQueuedResult(input, clientMessageId, body);
  }

  const trySend = async (): Promise<SendMessageResult> => {
    const finish = (result: { message: Message; idempotent?: boolean }): SendMessageResult => {
      void removeOutbox(clientMessageId);
      return {
        message: result.message,
        clientMessageId,
        idempotent: result.idempotent,
        queued: false,
      };
    };

    if (socketService.isConnected()) {
      try {
        return finish(await emitMessageSend(input.chatId, body));
      } catch (socketErr) {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            return finish(await sendViaRest(body));
          } catch {
            throw socketErr;
          }
        }
        throw socketErr;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      return finish(await sendViaRest(body));
    }

    throw new Error('offline');
  };

  try {
    return await Promise.race([
      trySend(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), SEND_ATTEMPT_MAX_MS);
      }),
    ]);
  } catch (err) {
    if (isQueueableSendError(err)) {
      return buildQueuedResult(input, clientMessageId, body);
    }
    await markOutboxFailed(clientMessageId);
    throw err;
  }
}

export async function retryOutboxMessage(clientMessageId: string): Promise<SendMessageResult | null> {
  await resetOutboxPending(clientMessageId);
  const entry = (await listPendingOutbox()).find((e) => e.clientMessageId === clientMessageId);
  if (!entry) return null;
  return deliverOutboxEntry(entry);
}
