import type { MessageKind } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import { ZodError } from "zod";

import type { AppConfig } from "../config/index.js";
import { AppError } from "../errors/index.js";
import { requireActiveMember } from "../lib/chat-access.js";
import { assertNotBlockedPair } from "../lib/moderation-guard.js";
import type { Logger } from "../lib/logger.js";
import { createCallLog, setCallStatus } from "../lib/calls/call-service.js";
import {
  notifyIncomingCall,
  setCallParticipantsBusy,
  terminateCall,
} from "../lib/calls/call-lifecycle.js";
import * as chatsService from "../modules/chats/chats.service.js";

import { SOCKET_PROTOCOL_VERSION } from "./constants.js";
import {
  clearNotificationContextRedis,
  setNotificationContextRedis,
} from "../lib/notification-context-redis.js";
import { markUserPresentRedis } from "../lib/presence-redis.js";
import {
  clearNotificationContext,
  setNotificationContext,
} from "./notification-context-memory.js";
import { clearPresence, setPresence } from "./presence-memory.js";
import {
  callAnswerSchema,
  callEndSchema,
  callIceSchema,
  callOfferSchema,
  callSignalSchema,
  chatSubscribeSchema,
  messageSendSocketSchema,
  notificationContextSchema,
  presenceUpdateSchema,
  receiptBatchSchema,
  readChatSchema,
  syncHelloSchema,
  typingSchema,
} from "./schemas.js";
import { emitMessageNewToMembers } from "./message-broadcast.js";
import { emitToChatMembers } from "./chat-broadcast.js";
import { roomChat, roomUser } from "./rooms.js";
import { createSocketLimiter } from "./socket-rate-limit.js";
import { clearTypingThrottle, shouldEmitTypingUpdate } from "./typing-throttle.js";
import {
  getActiveCall,
  getActiveCallForUser,
  isUserInCall,
  markCallConnected,
  putActiveCall,
} from "./calls-state.js";
import { v4 as uuidv4 } from "uuid";
import { redactLogPayload } from "../lib/log-redaction.js";

function ackFn(cb: unknown): ((payload: unknown) => void) | undefined {
  return typeof cb === "function" ? (cb as (payload: unknown) => void) : undefined;
}

function ackError(err: unknown): { ok: false; code: string; message: string; details?: unknown } {
  if (err instanceof ZodError) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload", details: err.flatten() };
  }
  if (err instanceof AppError) {
    return { ok: false, code: err.code, message: err.message, details: err.details };
  }
  return { ok: false, code: "INTERNAL_ERROR", message: "Internal error" };
}

const reconnectDeliveryFlushInFlight = new Set<string>();

async function emitReconnectDeliveryBatches(
  io: Server,
  userId: string,
  batches: Array<{ chatId: string; messageIds: string[]; deliveredAt: Date }>,
): Promise<void> {
  for (const b of batches) {
    if (b.messageIds.length === 0) continue;
    await emitToChatMembers(io, b.chatId, "receipt:delivered", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: b.chatId,
      userId,
      messageIds: b.messageIds,
      deliveredAt: b.deliveredAt.toISOString(),
    });
  }
}

async function continueReconnectDeliveryFlush(
  io: Server,
  userId: string,
  config: AppConfig,
  logger: Logger,
): Promise<void> {
  if (reconnectDeliveryFlushInFlight.has(userId)) return;
  reconnectDeliveryFlushInFlight.add(userId);
  try {
    for (let pass = 0; pass < config.chatReconnectDeliveryMaxAsyncPasses; pass += 1) {
      const out = await chatsService.flushUndeliveredReceiptsOnReconnect(userId, {
        pageSize: config.chatReconnectDeliveryPageSize,
        budgetMs: config.chatReconnectDeliverySyncBudgetMs,
      });
      await emitReconnectDeliveryBatches(io, userId, out.batches);
      if (!out.hasMore) break;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } catch (err) {
    logger.warn({ err, userId }, "continueReconnectDeliveryFlush failed");
  } finally {
    reconnectDeliveryFlushInFlight.delete(userId);
  }
}

export function registerSocketHandlers(io: Server, config: AppConfig, logger: Logger): void {
  io.on("connection", (socket: Socket) => {
    const userId = socket.data.user.sub;
    socket.data.subscribedChats = new Set<string>();
    socket.data.typingChatId = null;

    void socket.join(roomUser(userId));
    void markUserPresentRedis(userId, config).catch(() => {});

    chatsService.setUserOnline(userId).then(async () => {
      const sharedUserIds = await chatsService.getSharedChatMemberIds(userId);
      const now = new Date().toISOString();
      for (const targetId of sharedUserIds) {
        io.to(roomUser(targetId)).emit("presence:changed", {
          userId,
          status: "online",
          lastSeenAt: now,
        });
      }
      try {
        const initialFlush = await chatsService.flushUndeliveredReceiptsOnReconnect(userId, {
          pageSize: config.chatReconnectDeliveryPageSize,
          budgetMs: config.chatReconnectDeliverySyncBudgetMs,
        });
        await emitReconnectDeliveryBatches(io, userId, initialFlush.batches);
        if (initialFlush.hasMore) {
          void continueReconnectDeliveryFlush(io, userId, config, logger);
        }
      } catch (flushErr) {
        logger.warn({ err: flushErr, userId }, "flushUndeliveredReceiptsOnReconnect failed");
      }
    }).catch((err) => logger.error({ err }, "Failed to set user online"));

    socket.emit("session:ready", {
      v: SOCKET_PROTOCOL_VERSION,
      serverTime: new Date().toISOString(),
      socketId: socket.id,
    });

    const typingTimeouts = new Map<string, NodeJS.Timeout>();
    const offerLimiter = createSocketLimiter({ capacity: 3, refillPerSec: 0.1 }); // ~3 per 30s
    const iceLimiter = createSocketLimiter({ capacity: 60, refillPerSec: 10 }); // burst then steady

    const clearTypingTimer = (): void => {
      const t = typingTimeouts.get(socket.id);
      if (t) {
        clearTimeout(t);
        typingTimeouts.delete(socket.id);
      }
    };

    socket.on("chat:subscribe", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = chatSubscribeSchema.parse(payload);
        await requireActiveMember(userId, p.chatId);
        await socket.join(roomChat(p.chatId));
        socket.data.subscribedChats.add(p.chatId);
        ack?.({ ok: true, data: { chatId: p.chatId } });
        socket.emit("chat:subscribed", { chatId: p.chatId });
      } catch (err) {
        const errBody = ackError(err);
        logger.warn({ errBody, socketId: socket.id, userId }, "chat:subscribe failed");
        ack?.(errBody);
        socket.emit("chat:error", { code: errBody.code, message: errBody.message });
      }
    });

    socket.on("chat:unsubscribe", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = chatSubscribeSchema.parse(payload);
        await socket.leave(roomChat(p.chatId));
        socket.data.subscribedChats.delete(p.chatId);
        ack?.({ ok: true, data: { chatId: p.chatId } });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("message:send", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const body = messageSendSocketSchema.parse(payload);
        const out = await chatsService.createMessage(userId, body.chatId, {
          clientMessageId: body.clientMessageId,
          kind: body.kind as MessageKind,
          ciphertext: body.ciphertext,
          contentMeta: body.contentMeta ?? null,
          replyToId: body.replyToId ?? null,
          threadRootId: body.threadRootId ?? null,
          broadcastToChannel: body.broadcastToChannel ?? false,
        });
        // Ensure the sender receives `message:new` even if `chat:subscribe` has not completed yet.
        await socket.join(roomChat(body.chatId));
        socket.data.subscribedChats.add(body.chatId);
        const messagePayload = {
          v: SOCKET_PROTOCOL_VERSION,
          chatId: body.chatId,
          message: out.message,
          idempotent: out.idempotent,
        };
        await emitMessageNewToMembers(io, body.chatId, messagePayload);
        if (!out.idempotent && out.threadUpdated) {
          await emitToChatMembers(io, body.chatId, "thread:updated", {
            v: SOCKET_PROTOCOL_VERSION,
            chatId: body.chatId,
            rootMessageId: out.threadUpdated.rootMessageId,
            replyCount: out.threadUpdated.replyCount,
            lastReplyAt: out.threadUpdated.lastReplyAt.toISOString(),
          });
        }
        ack?.({ ok: true, data: { message: out.message, idempotent: out.idempotent } });
      } catch (err) {
        logger.warn({ err, socketId: socket.id, userId }, "message:send failed");
        ack?.(ackError(err));
      }
    });

    // --- Sprint 9: call signaling (WebRTC) ---

    socket.on("call:offer", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        if (!offerLimiter.take(userId, 1)) {
          throw new AppError(429, "RATE_LIMIT", "Too many call attempts");
        }
        const p = callOfferSchema.parse(payload);
        await requireActiveMember(userId, p.chatId);
        await assertNotBlockedPair(userId, p.peerUserId);

        if (isUserInCall(userId)) {
          throw new AppError(409, "CALL_BUSY", "You are already in a call");
        }
        const peerBusy = getActiveCallForUser(p.peerUserId);
        if (peerBusy) {
          io.to(roomUser(userId)).emit("call:busy", {
            peerUserId: p.peerUserId,
            reason: "busy",
          });
          throw new AppError(409, "CALL_BUSY", "User is busy");
        }

        const callId = p.callId ?? uuidv4();
        const existing = getActiveCall(callId);
        if (existing) {
          throw new AppError(409, "CALL_EXISTS", "Call already exists");
        }

        await requireActiveMember(p.peerUserId, p.chatId);

        const kind = p.media.video ? "VIDEO" : "AUDIO";

        await createCallLog({
          callId,
          chatId: p.chatId,
          initiatorId: userId,
          peerId: p.peerUserId,
          kind,
          meta: {
            callId,
            initiatorDeviceId: p.deviceId,
            media: p.media,
            ...(p.videoFallback ? { videoFallback: true } : {}),
          },
        });

        const timeoutId = setTimeout(() => {
          const c = getActiveCall(callId);
          if (!c || c.status === "CONNECTED") return;
          void terminateCall(io, logger, config, {
            callId,
            status: "MISSED",
            endReason: "timeout",
          }).catch(() => {});
        }, 30_000);

        putActiveCall({
          callId,
          chatId: p.chatId,
          initiatorId: userId,
          peerId: p.peerUserId,
          kind,
          status: "RINGING",
          createdAt: Date.now(),
          connectedAt: null,
          iceCount: { initiator: 0, peer: 0 },
          timeoutId,
        });

        await setCallStatus(callId, "RINGING");

        logger.info(
          redactLogPayload({ callId, chatId: p.chatId, initiatorId: userId, peerId: p.peerUserId }),
          "call offer routed",
        );

        io.to(roomUser(p.peerUserId)).emit("call:incoming", {
          callId,
          chatId: p.chatId,
          fromUserId: userId,
          sdp: p.sdp,
          media: p.media,
          createdAt: new Date().toISOString(),
        });
        io.to(roomUser(userId)).emit("call:ringing", { callId });
        void notifyIncomingCall({
          callId,
          chatId: p.chatId,
          calleeUserId: p.peerUserId,
          callerUserId: userId,
          isVideo: p.media.video,
        }).catch(() => {});
        ack?.({ ok: true, data: { callId } });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("call:answer", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = callAnswerSchema.parse(payload);
        const c = getActiveCall(p.callId);
        if (!c) throw new AppError(404, "NOT_FOUND", "Call not found");
        if (c.peerId !== userId) throw new AppError(403, "FORBIDDEN", "Not call recipient");

        await assertNotBlockedPair(c.initiatorId, c.peerId);

        markCallConnected(p.callId);
        await setCallStatus(p.callId, "CONNECTED", { peerDeviceId: p.deviceId });
        await setCallParticipantsBusy(io, c);

        logger.info(
          redactLogPayload({ callId: p.callId, chatId: c.chatId, initiatorId: c.initiatorId, peerId: c.peerId }),
          "call answered",
        );

        io.to(roomUser(c.initiatorId)).emit("call:answered", { callId: p.callId, sdp: p.sdp });
        ack?.({ ok: true });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("call:reject", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = callEndSchema.parse(payload);
        const c = getActiveCall(p.callId);
        if (!c) throw new AppError(404, "NOT_FOUND", "Call not found");
        if (c.peerId !== userId) throw new AppError(403, "FORBIDDEN", "Not call recipient");
        io.to(roomUser(c.initiatorId)).emit("call:rejected", { callId: p.callId, reason: p.reason ?? "rejected" });
        await terminateCall(io, logger, config, {
          callId: p.callId,
          status: "FAILED",
          endReason: p.reason ?? "rejected",
          skipSocketEnded: true,
        });
        logger.info(
          redactLogPayload({ callId: p.callId, chatId: c.chatId, initiatorId: c.initiatorId, peerId: c.peerId }),
          "call rejected",
        );
        ack?.({ ok: true });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("call:end", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = callEndSchema.parse(payload);
        const c = getActiveCall(p.callId);
        if (!c) throw new AppError(404, "NOT_FOUND", "Call not found");
        if (c.initiatorId !== userId && c.peerId !== userId) throw new AppError(403, "FORBIDDEN", "Not in call");
        await terminateCall(io, logger, config, {
          callId: p.callId,
          status: "COMPLETED",
          endReason: p.reason ?? "ended",
        });
        logger.info(
          redactLogPayload({ callId: p.callId, chatId: c.chatId, initiatorId: c.initiatorId, peerId: c.peerId }),
          "call ended",
        );
        ack?.({ ok: true });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("call:ice", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        if (!iceLimiter.take(userId, 1)) {
          throw new AppError(429, "RATE_LIMIT", "Too many ICE candidates");
        }
        const p = callIceSchema.parse(payload);
        const c = getActiveCall(p.callId);
        if (!c) throw new AppError(404, "NOT_FOUND", "Call not found");
        if (c.initiatorId !== userId && c.peerId !== userId) throw new AppError(403, "FORBIDDEN", "Not in call");

        const isInitiator = c.initiatorId === userId;
        if (isInitiator) c.iceCount.initiator += 1;
        else c.iceCount.peer += 1;

        const count = isInitiator ? c.iceCount.initiator : c.iceCount.peer;
        if (count > 200) {
          throw new AppError(429, "ICE_LIMIT", "Too many ICE candidates");
        }

        const target = isInitiator ? c.peerId : c.initiatorId;
        // Never log candidates.
        io.to(roomUser(target)).emit("call:ice", {
          callId: p.callId,
          candidate: p.candidate,
          sdpMid: p.sdpMid,
          sdpMLineIndex: p.sdpMLineIndex,
        });
        ack?.({ ok: true });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("call:signal", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = callSignalSchema.parse(payload);
        const c = getActiveCall(p.callId);
        if (!c) throw new AppError(404, "NOT_FOUND", "Call not found");
        if (c.initiatorId !== userId && c.peerId !== userId) {
          throw new AppError(403, "FORBIDDEN", "Not in call");
        }
        const target = c.initiatorId === userId ? c.peerId : c.initiatorId;
        io.to(roomUser(target)).emit("call:signal", {
          callId: p.callId,
          signal: p.signal,
          fromUserId: userId,
        });
        ack?.({ ok: true });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("receipt:delivered", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = receiptBatchSchema.parse(payload);
        const out = await chatsService.markMessagesDelivered(userId, p.chatId, p.messageIds);
        if (out.messageIds.length > 0) {
          await emitToChatMembers(io, out.chatId, "receipt:delivered", {
            v: SOCKET_PROTOCOL_VERSION,
            chatId: out.chatId,
            userId,
            messageIds: out.messageIds,
            deliveredAt: out.deliveredAt?.toISOString() ?? null,
          });
        }
        ack?.({ ok: true, data: out });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("receipt:read", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = receiptBatchSchema.parse(payload);
        const out = await chatsService.markMessagesRead(userId, p.chatId, p.messageIds);
        if (out.messageIds.length > 0 && out.shareReadReceipts) {
          await emitToChatMembers(io, out.chatId, "receipt:read", {
            v: SOCKET_PROTOCOL_VERSION,
            chatId: out.chatId,
            userId,
            messageIds: out.messageIds,
            readAt: out.readAt?.toISOString() ?? null,
          });
        }
        ack?.({ ok: true, data: out });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("receipt:read_chat", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = readChatSchema.parse(payload);
        const out = await chatsService.markChatAsRead(userId, p.chatId);
        if (out.messageIds.length > 0 && out.shareReadReceipts) {
          await emitToChatMembers(io, out.chatId, "receipt:read", {
            v: SOCKET_PROTOCOL_VERSION,
            chatId: out.chatId,
            userId,
            messageIds: out.messageIds,
            readAt: out.readAt?.toISOString() ?? null,
          });
        }
        ack?.({ ok: true, data: out });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("typing:start", async (payload: unknown) => {
      try {
        const p = typingSchema.parse(payload);
        await requireActiveMember(userId, p.chatId);

        const prevChat = socket.data.typingChatId;
        if (prevChat && prevChat !== p.chatId) {
          clearTypingThrottle(prevChat, userId);
          socket.to(roomChat(prevChat)).volatile.emit("typing:update", {
            chatId: prevChat,
            userId,
            isTyping: false,
          });
        }
        socket.data.typingChatId = p.chatId;

        if (shouldEmitTypingUpdate(p.chatId, userId)) {
          socket.to(roomChat(p.chatId)).volatile.emit("typing:update", {
            chatId: p.chatId,
            userId,
            isTyping: true,
          });
        }

        clearTypingTimer();
        const t = setTimeout(() => {
          typingTimeouts.delete(socket.id);
          clearTypingThrottle(p.chatId, userId);
          socket.data.typingChatId = null;
          socket.to(roomChat(p.chatId)).volatile.emit("typing:update", {
            chatId: p.chatId,
            userId,
            isTyping: false,
          });
        }, 5000);
        typingTimeouts.set(socket.id, t);
      } catch {
        /* ignore invalid typing */
      }
    });

    socket.on("typing:stop", async (payload: unknown) => {
      try {
        const p = typingSchema.parse(payload);
        await requireActiveMember(userId, p.chatId);
        clearTypingTimer();
        clearTypingThrottle(p.chatId, userId);
        socket.data.typingChatId = null;
        socket.to(roomChat(p.chatId)).volatile.emit("typing:update", {
          chatId: p.chatId,
          userId,
          isTyping: false,
        });
      } catch {
        /* ignore */
      }
    });

    socket.on("notification:context", async (payload: unknown) => {
      try {
        const p = notificationContextSchema.parse(payload);
        setNotificationContext(userId, p.tabVisible, p.activeChatId);
        await setNotificationContextRedis(userId, p.tabVisible, p.activeChatId, config);
      } catch {
        /* ignore invalid payloads */
      }
    });

    socket.on("presence:update", async (payload: unknown) => {
      try {
        const p = presenceUpdateSchema.parse(payload);
        setPresence(userId, p.status, p.lastSeenAt ?? null);
        void markUserPresentRedis(userId, config).catch(() => {});
        if (p.status === "online") {
          await chatsService.touchUserLastSeen(userId);
        }
        const sharedUserIds = await chatsService.getSharedChatMemberIds(userId);
        const lastSeenAt = p.lastSeenAt ? p.lastSeenAt.toISOString() : null;
        for (const targetId of sharedUserIds) {
          socket.to(roomUser(targetId)).emit("presence:changed", {
            userId,
            status: p.status,
            lastSeenAt,
          });
        }
      } catch {
        /* ignore */
      }
    });

    socket.on("sync:hello", async (payload: unknown, cb?: unknown) => {
      const ack = ackFn(cb);
      try {
        const p = syncHelloSchema.parse(payload);
        const hints = await chatsService.syncHelloForChats(userId, p.chats);
        ack?.({ ok: true, data: { chats: hints } });
      } catch (err) {
        ack?.(ackError(err));
      }
    });

    socket.on("disconnecting", () => {
      clearTypingTimer();
      for (const chatId of socket.data.subscribedChats) {
        clearTypingThrottle(chatId, userId);
      }
      const userRoom = io.sockets.adapter.rooms.get(roomUser(userId));
      const peers = userRoom ? userRoom.size : 0;
      if (peers <= 1) {
        clearPresence(userId);
        clearNotificationContext(userId);
        void clearNotificationContextRedis(userId, config);
        chatsService.setUserOffline(userId).then(async () => {
          const sharedUserIds = await chatsService.getSharedChatMemberIds(userId);
          const now = new Date().toISOString();
          for (const targetId of sharedUserIds) {
            io.to(roomUser(targetId)).emit("presence:changed", {
              userId,
              status: "offline",
              lastSeenAt: now,
            });
          }
        }).catch((err) => logger.error({ err }, "Failed to set user offline"));
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, "socket.io disconnect");
    });
  });
}
