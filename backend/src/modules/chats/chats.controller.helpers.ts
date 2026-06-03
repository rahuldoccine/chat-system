import type { Server } from "socket.io";

import { SOCKET_PROTOCOL_VERSION } from "../../sockets/constants.js";
import { emitToChatMembers } from "../../sockets/chat-broadcast.js";

type ReceiptEmitOut = {
  chatId: string;
  messageIds: string[];
  shareReadReceipts?: boolean;
  readAt?: Date | null;
  deliveredAt?: Date | null;
};

export async function emitReadReceiptIfNeeded(
  io: Server | null,
  userId: string,
  out: ReceiptEmitOut,
): Promise<void> {
  if (!io || out.messageIds.length === 0 || !out.shareReadReceipts) return;
  await emitToChatMembers(io, out.chatId, "receipt:read", {
    v: SOCKET_PROTOCOL_VERSION,
    chatId: out.chatId,
    userId,
    messageIds: out.messageIds,
    readAt: out.readAt?.toISOString() ?? null,
  });
}

export async function emitDeliveredReceiptIfNeeded(
  io: Server | null,
  userId: string,
  out: ReceiptEmitOut,
): Promise<void> {
  if (!io || out.messageIds.length === 0) return;
  await emitToChatMembers(io, out.chatId, "receipt:delivered", {
    v: SOCKET_PROTOCOL_VERSION,
    chatId: out.chatId,
    userId,
    messageIds: out.messageIds,
    deliveredAt: out.deliveredAt?.toISOString() ?? null,
  });
}
