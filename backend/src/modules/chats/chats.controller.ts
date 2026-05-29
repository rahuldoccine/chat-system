import type { MessageKind } from "@prisma/client";
import type { Request, Response } from "express";

import { parseBody, parseQuery } from "../../validation/validate.js";
import {
  createChatBodySchema,
  createMessageBodySchema,
  createPollBodySchema,
  listChatsQuerySchema,
  listMessagesQuerySchema,
  listThreadMessagesQuerySchema,
  searchMessagesQuerySchema,
  linkPreviewQuerySchema,
  patchChatE2eeBodySchema,
  patchChatMuteBodySchema,
  patchChatPinBodySchema,
  patchChatFavoriteBodySchema,
  patchChatCloseBodySchema,
  markMessagesReadBodySchema,
  markMessagesDeliveredBodySchema,
} from "./chats.schemas.js";
import { SOCKET_PROTOCOL_VERSION } from "../../sockets/constants.js";
import { emitToChatMembers } from "../../sockets/chat-broadcast.js";
import { emitMessageNewToMembers } from "../../sockets/message-broadcast.js";
import { getSocketIo } from "../../sockets/socket-holder.js";
import * as chatsService from "./chats.service.js";

export async function listChats(req: Request, res: Response): Promise<void> {
  const q = parseQuery(listChatsQuerySchema, req.query);
  const out = await chatsService.listChats(req.user!.sub, {
    limit: q.limit,
    cursor: q.cursor,
    type: q.type,
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(out);
}

export async function createChat(req: Request, res: Response): Promise<void> {
  const body = parseBody(createChatBodySchema, req.body);
  const out = await chatsService.createChat(req.user!.sub, body);
  res.status(out.created ? 201 : 200).json({ chat: out.chat, created: out.created });
}

export async function getChat(req: Request, res: Response): Promise<void> {
  const chat = await chatsService.getChat(req.user!.sub, req.params.chatId as string);
  res.json({ chat });
}

export async function patchChatMute(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchChatMuteBodySchema, req.body);
  const chatId = req.params.chatId as string;
  const mutedUntil = body.mutedUntil === null ? null : new Date(body.mutedUntil);
  await chatsService.patchChatMute(req.user!.sub, chatId, mutedUntil);
  res.status(204).end();
}

export async function patchChatPin(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchChatPinBodySchema, req.body);
  const chatId = req.params.chatId as string;
  await chatsService.patchChatPin(req.user!.sub, chatId, body.pinned);
  res.status(204).end();
}

export async function patchChatFavorite(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchChatFavoriteBodySchema, req.body);
  const chatId = req.params.chatId as string;
  await chatsService.patchChatFavorite(req.user!.sub, chatId, body.favorited);
  res.status(204).end();
}

export async function patchChatClose(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchChatCloseBodySchema, req.body);
  const chatId = req.params.chatId as string;
  await chatsService.patchChatClose(req.user!.sub, chatId, body.closed);
  res.status(204).end();
}

export async function patchChatE2ee(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchChatE2eeBodySchema, req.body);
  const chatId = req.params.chatId as string;
  await chatsService.patchChatE2eeMode(req.user!.sub, chatId, body.e2eeMode);
  res.status(204).end();
}

export async function getChatUnread(req: Request, res: Response): Promise<void> {
  const out = await chatsService.getChatUnreadBoundary(
    req.user!.sub,
    req.params.chatId as string,
  );
  res.json(out);
}

export async function markChatRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const chatId = req.params.chatId as string;
  const out = await chatsService.markChatAsRead(userId, chatId);
  const io = getSocketIo();
  if (io && out.messageIds.length > 0 && out.shareReadReceipts) {
    await emitToChatMembers(io, out.chatId, "receipt:read", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: out.chatId,
      userId,
      messageIds: out.messageIds,
      readAt: out.readAt?.toISOString() ?? null,
    });
  }
  res.setHeader("Cache-Control", "no-store");
  const unread = await chatsService.getChatUnreadBoundary(userId, chatId);
  res.json({ ...out, unread });
}

export async function markMessagesRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const chatId = req.params.chatId as string;
  const body = parseBody(markMessagesReadBodySchema, req.body);
  const out = await chatsService.markMessagesRead(userId, chatId, body.messageIds);
  const io = getSocketIo();
  if (io && out.messageIds.length > 0 && out.shareReadReceipts) {
    await emitToChatMembers(io, out.chatId, "receipt:read", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: out.chatId,
      userId,
      messageIds: out.messageIds,
      readAt: out.readAt?.toISOString() ?? null,
    });
  }
  res.setHeader("Cache-Control", "no-store");
  const unread = await chatsService.getChatUnreadBoundary(userId, chatId);
  res.json({ ...out, unread });
}

/** Reliable delivery receipt (HTTP); mirrors socket `receipt:delivered` broadcast. */
export async function markMessagesDelivered(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const chatId = req.params.chatId as string;
  const body = parseBody(markMessagesDeliveredBodySchema, req.body);
  const out = await chatsService.markMessagesDelivered(userId, chatId, body.messageIds);
  const io = getSocketIo();
  if (io && out.messageIds.length > 0) {
    await emitToChatMembers(io, out.chatId, "receipt:delivered", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: out.chatId,
      userId,
      messageIds: out.messageIds,
      deliveredAt: out.deliveredAt?.toISOString() ?? null,
    });
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(204).end();
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const q = parseQuery(listMessagesQuerySchema, req.query);
  const out = await chatsService.listMessages(req.user!.sub, req.params.chatId as string, {
    limit: q.limit,
    cursor: q.cursor,
  });
  res.json(out);
}

export async function listThreadMessages(req: Request, res: Response): Promise<void> {
  const q = parseQuery(listThreadMessagesQuerySchema, req.query);
  const out = await chatsService.listThreadMessages(
    req.user!.sub,
    req.params.chatId as string,
    req.params.rootMessageId as string,
    { limit: q.limit, cursor: q.cursor },
  );
  res.json(out);
}

export async function markThreadRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const chatId = req.params.chatId as string;
  const rootMessageId = req.params.rootMessageId as string;
  const out = await chatsService.markThreadAsRead(userId, chatId, rootMessageId);
  const io = getSocketIo();
  if (io && out.messageIds.length > 0 && out.shareReadReceipts) {
    await emitToChatMembers(io, out.chatId, "receipt:read", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: out.chatId,
      userId,
      messageIds: out.messageIds,
      readAt: out.readAt?.toISOString() ?? null,
    });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(out);
}

export async function searchMessages(req: Request, res: Response): Promise<void> {
  const q = parseQuery(searchMessagesQuerySchema, req.query);
  const out = await chatsService.searchMessagesInChat(
    req.user!.sub,
    req.params.chatId as string,
    q.q,
    { limit: q.limit, cursor: q.cursor },
  );
  res.json(out);
}

export async function getLinkPreview(req: Request, res: Response): Promise<void> {
  const q = parseQuery(linkPreviewQuerySchema, req.query);
  const { fetchLinkPreview } = await import("../../lib/link-preview.js");
  const preview = await fetchLinkPreview(q.url);
  res.json({ preview });
}

export async function createMessage(req: Request, res: Response): Promise<void> {
  const body = parseBody(createMessageBodySchema, req.body);
  const chatId = req.params.chatId as string;
  const out = await chatsService.createMessage(req.user!.sub, chatId, {
    clientMessageId: body.clientMessageId,
    kind: body.kind as MessageKind,
    ciphertext: body.ciphertext,
    contentMeta: body.contentMeta ?? null,
    replyToId: body.replyToId ?? null,
    threadRootId: body.threadRootId ?? null,
    broadcastToChannel: body.broadcastToChannel ?? false,
  });
  if (!out.idempotent) {
    const io = getSocketIo();
    if (io) {
      await emitMessageNewToMembers(io, chatId, {
        v: SOCKET_PROTOCOL_VERSION,
        chatId,
        message: out.message,
        idempotent: false,
      });
      if (out.threadUpdated) {
        await emitToChatMembers(io, chatId, "thread:updated", {
          v: SOCKET_PROTOCOL_VERSION,
          chatId,
          rootMessageId: out.threadUpdated.rootMessageId,
          replyCount: out.threadUpdated.replyCount,
          lastReplyAt: out.threadUpdated.lastReplyAt.toISOString(),
        });
      }
    }
  }
  res.status(out.idempotent ? 200 : 201).json(out);
}

export async function listPins(req: Request, res: Response): Promise<void> {
  const out = await chatsService.listPins(req.user!.sub, req.params.chatId as string);
  res.json(out);
}

export async function createPoll(req: Request, res: Response): Promise<void> {
  const body = parseBody(createPollBodySchema, req.body);
  const chatId = req.params.chatId as string;
  const out = await chatsService.createPollOnChat(req.user!.sub, chatId, {
    question: body.question,
    closesAt: body.closesAt ?? null,
    options: body.options,
    ciphertext: body.ciphertext ?? null,
    contentMeta: body.contentMeta ?? null,
    clientMessageId: body.clientMessageId ?? null,
  });
  const io = getSocketIo();
  if (io) {
    await emitMessageNewToMembers(io, chatId, {
      v: SOCKET_PROTOCOL_VERSION,
      chatId,
      message: out.message,
      idempotent: false,
    });
  }
  res.status(201).json({ poll: out.poll, message: out.message });
}
