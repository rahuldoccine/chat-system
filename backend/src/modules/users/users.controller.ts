import type { Request, Response } from "express";
import { z } from "zod";

import { ValidationError } from "../../errors/index.js";
import { parseBody } from "../../validation/validate.js";
import {
  patchMeBodySchema,
  patchSettingsBodySchema,
  userSearchQuerySchema,
} from "./users.schemas.js";
import * as usersService from "./users.service.js";
import { getSocketIo } from "../../sockets/socket-holder.js";
import { roomUser } from "../../sockets/rooms.js";

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await usersService.getMe(req.user!.sub);
  res.json({ user });
}

export async function patchMe(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchMeBodySchema, req.body);
  const user = await usersService.patchMe(req.user!.sub, body);
  const io = getSocketIo();
  const profilePayload = {
    userId: user.id,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
  // Global broadcast for other users' UIs; user room for all of this user's tabs/devices.
  io?.emit("user:profile:updated", profilePayload);
  io?.to(roomUser(user.id)).emit("user:profile:updated", profilePayload);
  res.json({ user });
}

const uuidParam = z.string().uuid();

export async function getUserById(req: Request, res: Response): Promise<void> {
  const parsed = uuidParam.safeParse(req.params.id);
  if (!parsed.success) {
    throw new ValidationError("Invalid user id", parsed.error.flatten());
  }
  const user = await usersService.getUserById(req.user!.sub, parsed.data);
  res.json({ user });
}

export async function searchUsers(req: Request, res: Response): Promise<void> {
  const q = userSearchQuerySchema.parse(req.query);
  const users = await usersService.searchUsers(req.user!.sub, q.q, q.limit);
  res.json({ data: users });
}

export async function getSettings(req: Request, res: Response): Promise<void> {
  const settings = await usersService.getOrCreateSettings(req.user!.sub);
  res.json({ settings });
}

export async function patchSettings(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchSettingsBodySchema, req.body);
  const settings = await usersService.patchSettings(req.user!.sub, body);
  res.json({ settings });
}
