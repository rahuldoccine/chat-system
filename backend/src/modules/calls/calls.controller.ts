import type { Request, Response } from "express";

import { parseBody, parseQuery } from "../../validation/validate.js";
import { getCallLogById, listCallsForUser, patchCallTranscript } from "../../lib/calls/call-service.js";
import { getCallDirection } from "../../lib/calls/call-helpers.js";
import { callHistoryQuerySchema, callTranscriptSchema } from "../../sockets/schemas.js";

export async function listMyCalls(req: Request, res: Response) {
  const q = parseQuery(callHistoryQuerySchema, req.query);
  const out = await listCallsForUser(req.user!.sub, {
    chatId: q.chatId,
    filter: q.filter ?? "all",
    cursor: q.cursor,
    limit: q.limit,
  });
  res.status(200).json({ ok: true, data: out.data, nextCursor: out.nextCursor });
}

export async function getCall(req: Request, res: Response) {
  const callId = String(req.params.callId);
  const row = await getCallLogById(callId);
  if (!row) {
    res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Call not found" });
    return;
  }
  const userId = req.user!.sub;
  if (row.initiatorId !== userId && row.peerId !== userId) {
    res.status(403).json({ ok: false, code: "FORBIDDEN", message: "Not in call" });
    return;
  }
  const meta = row.metadata ?? {};
  const durationSec =
    typeof (meta as { durationSec?: number }).durationSec === "number"
      ? (meta as { durationSec: number }).durationSec
      : row.endedAt && row.startedAt
        ? Math.max(0, Math.floor((row.endedAt.getTime() - row.startedAt.getTime()) / 1000))
        : 0;
  res.status(200).json({
    ok: true,
    data: {
      ...row,
      durationSec,
      direction: getCallDirection(userId, row),
    },
  });
}

export async function updateCallTranscript(req: Request, res: Response) {
  const callId = String(req.params.callId);
  const body = parseBody(callTranscriptSchema, req.body);
  await patchCallTranscript(req.user!.sub, callId, body.transcript);
  res.status(200).json({ ok: true });
}
