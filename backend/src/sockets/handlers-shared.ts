import type { Server } from "socket.io";
import { ZodError } from "zod";

import type { AppConfig } from "../config/index.js";
import { AppError } from "../errors/index.js";
import type { Logger } from "../lib/logger.js";
import * as chatsService from "../modules/chats/chats.service.js";
import { SOCKET_PROTOCOL_VERSION } from "./constants.js";
import { emitToChatMembers } from "./chat-broadcast.js";

export function ackFn(cb: unknown): ((payload: unknown) => void) | undefined {
  return typeof cb === "function" ? (cb as (payload: unknown) => void) : undefined;
}

export function ackError(err: unknown): { ok: false; code: string; message: string; details?: unknown } {
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

export async function continueReconnectDeliveryFlush(
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

export async function flushReconnectDeliveriesOnConnect(
  io: Server,
  userId: string,
  config: AppConfig,
  logger: Logger,
): Promise<void> {
  const initialFlush = await chatsService.flushUndeliveredReceiptsOnReconnect(userId, {
    pageSize: config.chatReconnectDeliveryPageSize,
    budgetMs: config.chatReconnectDeliverySyncBudgetMs,
  });
  await emitReconnectDeliveryBatches(io, userId, initialFlush.batches);
  if (initialFlush.hasMore) {
    void continueReconnectDeliveryFlush(io, userId, config, logger);
  }
}
