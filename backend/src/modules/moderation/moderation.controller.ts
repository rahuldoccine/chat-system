import type { Request, Response } from "express";
import { z } from "zod";

import { ValidationError } from "../../errors/index.js";
import { parseBody, parseQuery } from "../../validation/validate.js";
import { getSocketIo } from "../../sockets/socket-holder.js";
import { roomUser } from "../../sockets/rooms.js";

import {
  listAdminReportsQuerySchema,
  patchAdminReportBodySchema,
  postBlockSchema,
  postReportSchema,
} from "./moderation.schemas.js";
import * as moderationService from "./moderation.service.js";

const uuidParam = z.string().uuid();

function emitBlockUpdated(blockerId: string, blockedId: string, blocked: boolean) {
  const io = getSocketIo();
  const payload = { blockerId, blockedId, blocked };
  io?.to(roomUser(blockerId)).emit("user:block:updated", payload);
  io?.to(roomUser(blockedId)).emit("user:block:updated", payload);
}

export async function getBlockStatus(req: Request, res: Response) {
  const parsed = uuidParam.safeParse(req.params.userId);
  if (!parsed.success) {
    throw new ValidationError("Invalid user id", parsed.error.flatten());
  }
  const status = await moderationService.getBlockStatus(req.user!.sub, parsed.data);
  res.json({ data: status });
}

export async function postBlock(req: Request, res: Response) {
  const body = parseBody(postBlockSchema, req.body);
  const blockerId = req.user!.sub;
  await moderationService.blockUser(blockerId, body.blockedUserId);
  emitBlockUpdated(blockerId, body.blockedUserId, true);
  res.status(200).json({ ok: true });
}

export async function deleteBlock(req: Request, res: Response) {
  const blockedUserId = String(req.params.blockedUserId ?? "");
  const blockerId = req.user!.sub;
  await moderationService.unblockUser(blockerId, blockedUserId);
  emitBlockUpdated(blockerId, blockedUserId, false);
  res.status(200).json({ ok: true });
}

export async function postReport(req: Request, res: Response) {
  const body = parseBody(postReportSchema, req.body);
  const row = await moderationService.createReport(req.user!.sub, body);
  res.status(201).json({ ok: true, data: { id: row.id } });
}

export async function listAdminReports(req: Request, res: Response) {
  const q = parseQuery(listAdminReportsQuerySchema, req.query);
  const result = await moderationService.listAdminReports({
    status: q.status,
    limit: q.limit,
    cursor: q.cursor,
  });
  res.json(result);
}

export async function patchAdminReport(req: Request, res: Response) {
  const parsed = uuidParam.safeParse(req.params.reportId);
  if (!parsed.success) {
    throw new ValidationError("Invalid report id", parsed.error.flatten());
  }
  const body = parseBody(patchAdminReportBodySchema, req.body);
  const row = await moderationService.patchAdminReportStatus(parsed.data, body.status);
  res.json({ data: row });
}

