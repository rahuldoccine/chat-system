import type { CallKind, CallLog, CallStatus, Prisma } from "@prisma/client";

import { AppError } from "../../errors/index.js";
import { getPrisma } from "../prisma.js";
import { getCallDirection } from "./call-helpers.js";

export type CallMeta = {
  callId: string;
  initiatorDeviceId: string;
  peerDeviceId?: string;
  media: { audio: boolean; video: boolean };
  endReason?: string;
  durationSec?: number;
  connectedAt?: string;
  transcript?: Array<{ t: number; speaker: string; text: string }>;
};

export async function createCallLog(input: {
  callId: string;
  chatId: string;
  initiatorId: string;
  peerId: string;
  kind: "AUDIO" | "VIDEO";
  meta: CallMeta;
}) {
  const prisma = getPrisma();
  return prisma.callLog.create({
    data: {
      id: input.callId,
      chatId: input.chatId,
      initiatorId: input.initiatorId,
      peerId: input.peerId,
      kind: input.kind,
      status: "INITIATED",
      metadata: input.meta as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function setCallStatus(
  callId: string,
  status: "RINGING" | "CONNECTED" | "COMPLETED" | "MISSED" | "FAILED",
  meta?: Partial<CallMeta>,
) {
  const prisma = getPrisma();
  const row = await prisma.callLog.findUnique({ where: { id: callId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Call not found");
  const prevMeta = (row.metadata ?? {}) as unknown as Record<string, unknown>;
  return prisma.callLog.update({
    where: { id: callId },
    data: {
      status,
      endedAt:
        status === "COMPLETED" || status === "MISSED" || status === "FAILED"
          ? new Date()
          : undefined,
      metadata: meta
        ? ({ ...prevMeta, ...meta } as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

export async function finalizeCall(
  callId: string,
  status: "COMPLETED" | "MISSED" | "FAILED",
  opts: { endReason: string; durationSec: number; connectedAt?: string },
) {
  return setCallStatus(callId, status, {
    endReason: opts.endReason,
    durationSec: opts.durationSec,
    connectedAt: opts.connectedAt,
  });
}

export async function getCallLogById(callId: string) {
  const prisma = getPrisma();
  return prisma.callLog.findUnique({ where: { id: callId } });
}

export async function patchCallTranscript(
  userId: string,
  callId: string,
  transcript: Array<{ t: number; speaker: string; text: string }>,
) {
  const prisma = getPrisma();
  const row = await getCallLogById(callId);
  if (!row) throw new AppError(404, "NOT_FOUND", "Call not found");
  if (row.initiatorId !== userId && row.peerId !== userId) {
    throw new AppError(403, "FORBIDDEN", "Not in call");
  }
  const prevMeta = (row.metadata ?? {}) as unknown as Record<string, unknown>;
  return prisma.callLog.update({
    where: { id: callId },
    data: {
      metadata: { ...prevMeta, transcript } as unknown as Prisma.InputJsonValue,
    },
  });
}

export type EnrichedCallRow = {
  id: string;
  chatId: string | null;
  initiatorId: string;
  peerId: string | null;
  kind: CallKind;
  status: CallStatus;
  startedAt: Date;
  endedAt: Date | null;
  metadata: unknown;
  durationSec: number;
  direction: ReturnType<typeof getCallDirection>;
  peer: { id: string; displayName: string | null; email: string; avatarUrl: string | null } | null;
};

function durationFromRow(row: CallLog): number {
  const meta = (row.metadata ?? {}) as CallMeta;
  if (typeof meta.durationSec === "number") return meta.durationSec;
  if (row.endedAt && row.startedAt) {
    return Math.max(0, Math.floor((row.endedAt.getTime() - row.startedAt.getTime()) / 1000));
  }
  return 0;
}

export async function listCallsForUser(
  userId: string,
  opts: { chatId?: string; filter?: "all" | "missed" | "dialed" | "received"; cursor?: string; limit?: number },
): Promise<{ data: EnrichedCallRow[]; nextCursor: string | null }> {
  const prisma = getPrisma();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const where: Prisma.CallLogWhereInput = {
    OR: [{ initiatorId: userId }, { peerId: userId }],
  };
  if (opts.chatId) where.chatId = opts.chatId;

  const rows = await prisma.callLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      initiator: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      peer: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
    },
  });

  let slice = rows;
  if (opts.filter === "missed") {
    slice = rows.filter((r) => getCallDirection(userId, r) === "missed");
  } else if (opts.filter === "dialed") {
    slice = rows.filter((r) => getCallDirection(userId, r) === "dialed");
  } else if (opts.filter === "received") {
    slice = rows.filter((r) => getCallDirection(userId, r) === "received");
  }

  const page = slice.slice(0, limit);
  const nextCursor = slice.length > limit ? page[page.length - 1]?.id ?? null : null;

  const data: EnrichedCallRow[] = page.map((row) => {
    const peerUser = row.initiatorId === userId ? row.peer : row.initiator;
    return {
      id: row.id,
      chatId: row.chatId,
      initiatorId: row.initiatorId,
      peerId: row.peerId,
      kind: row.kind,
      status: row.status,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      metadata: row.metadata,
      durationSec: durationFromRow(row),
      direction: getCallDirection(userId, row),
      peer: peerUser
        ? {
            id: peerUser.id,
            displayName: peerUser.displayName,
            email: peerUser.email,
            avatarUrl: peerUser.avatarUrl,
          }
        : null,
    };
  });

  return { data, nextCursor };
}
