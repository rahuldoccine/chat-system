import type { Request, Response } from "express";
import { z } from "zod";

import { parseBody } from "../../validation/validate.js";
import { SOCKET_PROTOCOL_VERSION } from "../../sockets/constants.js";
import { emitToChatMembers } from "../../sockets/chat-broadcast.js";
import { getSocketIo } from "../../sockets/socket-holder.js";
import { patchMessageBodySchema } from "../chats/chats.schemas.js";
import * as chatsService from "../chats/chats.service.js";

const postReactionSchema = z.object({
  emoji: z.string().min(1).max(64),
});

function toIso(d: Date | string | null): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : d;
}

export async function pinMessage(req: Request, res: Response): Promise<void> {
  const out = await chatsService.pinMessage(req.user!.sub, req.params.messageId as string);
  res.status(201).json(out);
  const io = getSocketIo();
  if (io) {
    await emitToChatMembers(io, out.chatId, "message:pinned", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: out.chatId,
      messageId: out.messageId,
      pinnedById: req.user!.sub,
    });
  }
}

export async function unpinMessage(req: Request, res: Response): Promise<void> {
  const out = await chatsService.unpinMessage(req.user!.sub, req.params.messageId as string);
  res.status(204).end();
  const io = getSocketIo();
  if (io) {
    await emitToChatMembers(io, out.chatId, "message:unpinned", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: out.chatId,
      messageId: out.messageId,
    });
  }
}

export async function postReaction(req: Request, res: Response): Promise<void> {
  const body = parseBody(postReactionSchema, req.body);
  const out = await chatsService.addReaction(req.user!.sub, req.params.messageId as string, body.emoji);
  res.status(201).json(out);
  const io = getSocketIo();
  if (io) {
    await emitToChatMembers(io, out.chatId, "reaction:added", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: out.chatId,
      messageId: out.messageId,
      emoji: out.emoji,
      userId: req.user!.sub,
    });
  }
}

export async function deleteReaction(req: Request, res: Response): Promise<void> {
  const emoji = decodeURIComponent(req.params.emoji as string);
  const out = await chatsService.removeReaction(req.user!.sub, req.params.messageId as string, emoji);
  res.status(204).end();
  const io = getSocketIo();
  if (io) {
    await emitToChatMembers(io, out.chatId, "reaction:removed", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: out.chatId,
      messageId: out.messageId,
      emoji: out.emoji,
      userId: req.user!.sub,
    });
  }
}

export async function patchMessage(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchMessageBodySchema, req.body);
  const msg = await chatsService.patchMessage(req.user!.sub, req.params.messageId as string, body);
  res.json({ message: msg });
  const io = getSocketIo();
  if (io) {
    await emitToChatMembers(io, msg.chatId, "message:updated", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: msg.chatId,
      message: msg,
    });
  }
}

export async function deleteMessage(req: Request, res: Response): Promise<void> {
  const msg = await chatsService.deleteMessage(req.user!.sub, req.params.messageId as string);
  res.json({ message: msg });
  const io = getSocketIo();
  if (io) {
    await emitToChatMembers(io, msg.chatId, "message:deleted", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: msg.chatId,
      messageId: msg.id,
      deletedAt: toIso(msg.deletedAt),
    });
  }
}
