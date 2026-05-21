import type { Request, Response } from "express";
import { z } from "zod";

import { ValidationError } from "../../errors/index.js";
import { parseBody, parseQuery } from "../../validation/validate.js";
import {
  friendActionBodySchema,
  friendListQuerySchema,
  friendRequestBodySchema,
} from "./friends.schemas.js";
import * as friendsService from "./friends.service.js";

export async function listFriends(req: Request, res: Response): Promise<void> {
  const q = parseQuery(friendListQuerySchema, req.query);
  const data = await friendsService.listFriends(req.user!.sub, q.status);
  res.json({ data });
}

export async function requestFriend(req: Request, res: Response): Promise<void> {
  const body = parseBody(friendRequestBodySchema, req.body);
  const out = await friendsService.requestFriend(req.user!.sub, body);
  res.status(out.created ? 201 : 200).json(out);
}

export async function acceptFriend(req: Request, res: Response): Promise<void> {
  const body = parseBody(friendActionBodySchema, req.body);
  const friend = await friendsService.acceptFriend(req.user!.sub, body.friendId);
  res.json({ friend });
}

export async function rejectFriend(req: Request, res: Response): Promise<void> {
  const body = parseBody(friendActionBodySchema, req.body);
  const friend = await friendsService.rejectFriend(req.user!.sub, body.friendId);
  res.json({ friend });
}

const userIdParam = z.string().uuid();
const friendIdParam = z.string().uuid();

export async function cancelFriendRequest(req: Request, res: Response): Promise<void> {
  const parsed = friendIdParam.safeParse(req.params.friendId);
  if (!parsed.success) {
    throw new ValidationError("Invalid friend id", parsed.error.flatten());
  }
  await friendsService.cancelFriendRequest(req.user!.sub, parsed.data);
  res.status(204).end();
}

export async function removeFriend(req: Request, res: Response): Promise<void> {
  const parsed = userIdParam.safeParse(req.params.userId);
  if (!parsed.success) {
    throw new ValidationError("Invalid user id", parsed.error.flatten());
  }
  await friendsService.removeFriend(req.user!.sub, parsed.data);
  res.status(204).end();
}
