import type { Server } from "socket.io";

import type { AppConfig } from "../../config/index.js";
import type { Logger } from "../logger.js";
import { getPrisma } from "../prisma.js";
import * as chatsService from "../../modules/chats/chats.service.js";
import { emitMessageNewToMembers } from "../../sockets/message-broadcast.js";
import { SOCKET_PROTOCOL_VERSION } from "../../sockets/constants.js";
import { endActiveCall, getActiveCall, type ActiveCall } from "../../sockets/calls-state.js";
import { roomUser } from "../../sockets/rooms.js";
import { setPresence } from "../../sockets/presence-memory.js";
import { finalizeCall } from "./call-service.js";
import { createCallSystemMessage } from "./call-system-message.js";
import {
  enqueueIncomingCallPush,
  enqueueMissedCallPush,
  resolveUserDisplayName,
} from "./call-push.js";

async function broadcastPresence(
  io: Server,
  userId: string,
  status: "online" | "away" | "busy",
): Promise<void> {
  setPresence(userId, status, null);
  const sharedUserIds = await chatsService.getSharedChatMemberIds(userId);
  for (const targetId of sharedUserIds) {
    io.to(roomUser(targetId)).emit("presence:changed", {
      userId,
      status,
      lastSeenAt: null,
    });
  }
}

function computeDurationSec(c: ActiveCall): number {
  if (c.connectedAt) {
    return Math.max(0, Math.floor((Date.now() - c.connectedAt) / 1000));
  }
  return 0;
}

export async function setCallParticipantsBusy(io: Server, c: ActiveCall): Promise<void> {
  await Promise.all([
    broadcastPresence(io, c.initiatorId, "busy"),
    broadcastPresence(io, c.peerId, "busy"),
  ]);
}

export async function clearCallParticipantsBusy(io: Server, c: ActiveCall): Promise<void> {
  await Promise.all([
    broadcastPresence(io, c.initiatorId, "online"),
    broadcastPresence(io, c.peerId, "online"),
  ]);
}

export type TerminateCallInput = {
  callId: string;
  status: "COMPLETED" | "MISSED" | "FAILED";
  endReason: string;
  skipSocketEnded?: boolean;
};

/** Finalize DB, chat message, push, presence, and active-call cleanup. */
export async function terminateCall(
  io: Server,
  logger: Logger,
  _config: AppConfig,
  input: TerminateCallInput,
): Promise<void> {
  const c = getActiveCall(input.callId);
  if (!c) {
    const row = await finalizeCall(input.callId, input.status, {
      endReason: input.endReason,
      durationSec: 0,
    }).catch(() => null);
    if (!row) return;
    return;
  }

  const durationSec = computeDurationSec(c);
  const connectedAt = c.connectedAt ? new Date(c.connectedAt).toISOString() : undefined;

  await finalizeCall(input.callId, input.status, {
    endReason: input.endReason,
    durationSec,
    connectedAt,
  });

  endActiveCall(input.callId);
  await clearCallParticipantsBusy(io, c);

  const prisma = getPrisma();
  const row = await prisma.callLog.findUnique({
    where: { id: input.callId },
    select: { kind: true, chatId: true, initiatorId: true, peerId: true, status: true },
  });

  if (row?.chatId && row.peerId) {
    try {
      const message = await createCallSystemMessage({
        chatId: row.chatId,
        callId: input.callId,
        initiatorId: row.initiatorId,
        peerId: row.peerId,
        kind: row.kind,
        status: input.status,
        durationSec,
        endReason: input.endReason,
      });
      if (message) {
        await emitMessageNewToMembers(io, row.chatId, {
          v: SOCKET_PROTOCOL_VERSION,
          chatId: row.chatId,
          message,
        });
      }
    } catch (err) {
      logger.warn({ err, callId: input.callId }, "call system message failed");
    }
  }

  if (input.status === "MISSED" && row?.chatId && row.peerId) {
    const peerName = await resolveUserDisplayName(row.peerId);
    enqueueMissedCallPush({
      recipientUserId: row.initiatorId,
      chatId: row.chatId,
      callId: input.callId,
      peerName,
    });
  }

  if (!input.skipSocketEnded) {
    const payload = {
      callId: input.callId,
      reason: input.endReason,
      status: input.status,
      durationSec,
    };
    io.to(roomUser(c.initiatorId)).emit("call:ended", payload);
    io.to(roomUser(c.peerId)).emit("call:ended", payload);
  }
}

export async function notifyIncomingCall(params: {
    callId: string;
    chatId: string;
    calleeUserId: string;
    callerUserId: string;
    isVideo: boolean;
  },
): Promise<void> {
  const callerName = await resolveUserDisplayName(params.callerUserId);
  enqueueIncomingCallPush({
    calleeUserId: params.calleeUserId,
    chatId: params.chatId,
    callId: params.callId,
    callerName,
    isVideo: params.isVideo,
  });
}
