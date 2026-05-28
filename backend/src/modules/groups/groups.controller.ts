import type { Request, Response } from "express";

import { ValidationError } from "../../errors/index.js";
import { parseBody } from "../../validation/validate.js";
import { createChatBodySchema } from "../chats/chats.schemas.js";
import * as chatsService from "../chats/chats.service.js";
import { getGroupChatDetails } from "../../lib/groups/group-chat.js";
import {
  addGroupMemberBodySchema,
  patchGroupBodySchema,
  patchGroupMemberRoleBodySchema,
} from "./groups.schemas.js";

export async function getGroup(req: Request, res: Response): Promise<void> {
  const group = await getGroupChatDetails(req.user!.sub, req.params.groupId as string);
  res.json({ group });
}

export async function createGroup(req: Request, res: Response): Promise<void> {
  const body = parseBody(createChatBodySchema, req.body);
  if (body.type !== "GROUP") {
    throw new ValidationError("Expected type GROUP");
  }
  const out = await chatsService.createChat(req.user!.sub, body);
  res.status(out.created ? 201 : 200).json({ chat: out.chat, created: out.created });
}

export async function patchGroup(req: Request, res: Response): Promise<void> {
  const data = parseBody(patchGroupBodySchema, req.body);
  const chat = await chatsService.patchGroupChat(req.user!.sub, req.params.groupId as string, data);
  res.json({ chat });
}

export async function addMember(req: Request, res: Response): Promise<void> {
  const body = parseBody(addGroupMemberBodySchema, req.body);
  const chat = await chatsService.addGroupMember(req.user!.sub, req.params.groupId as string, body.userId);
  res.status(201).json({ chat });
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  await chatsService.removeGroupMember(
    req.user!.sub,
    req.params.groupId as string,
    req.params.userId as string,
  );
  res.status(204).end();
}

export async function patchMemberRole(req: Request, res: Response): Promise<void> {
  const body = parseBody(patchGroupMemberRoleBodySchema, req.body);
  await chatsService.patchGroupMemberRole(
    req.user!.sub,
    req.params.groupId as string,
    req.params.userId as string,
    body.role,
  );
  res.status(204).end();
}

export async function joinGroup(req: Request, res: Response): Promise<void> {
  const chat = await chatsService.joinPublicGroup(req.user!.sub, req.params.groupId as string);
  res.status(200).json({ chat });
}
