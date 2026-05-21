import type { Request, Response } from "express";

import { parseBody } from "../../validation/validate.js";
import { votePollBodySchema } from "../chats/chats.schemas.js";
import { SOCKET_PROTOCOL_VERSION } from "../../sockets/constants.js";
import { emitToChatMembers } from "../../sockets/chat-broadcast.js";
import { getSocketIo } from "../../sockets/socket-holder.js";
import * as pollsService from "./polls.service.js";

export async function getPoll(req: Request, res: Response): Promise<void> {
  const poll = await pollsService.getPollForUser(req.user!.sub, req.params.pollId as string);
  res.json({ poll });
}

export async function votePoll(req: Request, res: Response): Promise<void> {
  const body = parseBody(votePollBodySchema, req.body);
  const pollId = req.params.pollId as string;
  const out = await pollsService.votePoll(req.user!.sub, pollId, body.pollOptionId);
  const poll = await pollsService.getPollForUser(req.user!.sub, pollId);
  const io = getSocketIo();
  if (io) {
    await emitToChatMembers(io, poll.chatId, "poll:updated", {
      v: SOCKET_PROTOCOL_VERSION,
      chatId: poll.chatId,
      pollId: poll.id,
      poll,
    });
  }
  res.json({ ...out, poll });
}
