import type { ReportStatus } from "@prisma/client";

import { AppError } from "../../errors/index.js";
import { decodeMessageCursor, encodeMessageCursor } from "../../lib/cursor-pagination.js";
import { getPrisma } from "../../lib/prisma.js";

const reportUserSelect = {
  id: true,
  email: true,
  displayName: true,
} as const;

export type AdminReportUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type AdminReportItem = {
  id: string;
  status: ReportStatus;
  reason: string;
  details: string | null;
  createdAt: string;
  reviewedAt: string | null;
  chatId: string | null;
  targetMessageId: string | null;
  reporter: AdminReportUser;
  targetUser: AdminReportUser | null;
};

function mapReportUser(
  u: { id: string; email: string; displayName: string | null } | null,
): AdminReportUser | null {
  if (!u) return null;
  return { id: u.id, email: u.email, displayName: u.displayName };
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw new AppError(400, "INVALID", "Cannot block yourself");
  }
  const prisma = getPrisma();
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });
}

export async function unblockUser(blockerId: string, blockedId: string) {
  const prisma = getPrisma();
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });
}

export type BlockStatus = {
  blockedByMe: boolean;
  blockedByPeer: boolean;
};

export async function getBlockStatus(viewerId: string, peerUserId: string): Promise<BlockStatus> {
  if (viewerId === peerUserId) {
    return { blockedByMe: false, blockedByPeer: false };
  }
  const prisma = getPrisma();
  const [byMe, byPeer] = await Promise.all([
    prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: viewerId, blockedId: peerUserId } },
      select: { id: true },
    }),
    prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: peerUserId, blockedId: viewerId } },
      select: { id: true },
    }),
  ]);
  return { blockedByMe: Boolean(byMe), blockedByPeer: Boolean(byPeer) };
}

export async function createReport(
  reporterId: string,
  input: { targetUserId?: string; targetMessageId?: string; chatId?: string; reason: string; details?: string },
) {
  const prisma = getPrisma();
  if (!input.targetUserId && !input.targetMessageId && !input.chatId) {
    throw new AppError(400, "VALIDATION_ERROR", "Provide targetUserId and/or targetMessageId and/or chatId");
  }

  if (input.targetMessageId) {
    const msg = await prisma.message.findUnique({ where: { id: input.targetMessageId }, select: { chatId: true } });
    if (!msg) throw new AppError(404, "NOT_FOUND", "Message not found");
    const chatId = input.chatId ?? msg.chatId;
    const member = await prisma.chatMember.findFirst({ where: { userId: reporterId, chatId, leftAt: null } });
    if (!member) throw new AppError(403, "NOT_MEMBER", "You are not a member of this chat");
    input.chatId = chatId;
  }

  if (input.chatId && !input.targetMessageId) {
    const member = await prisma.chatMember.findFirst({ where: { userId: reporterId, chatId: input.chatId, leftAt: null } });
    if (!member) throw new AppError(403, "NOT_MEMBER", "You are not a member of this chat");
  }

  return prisma.report.create({
    data: {
      reporterId,
      targetUserId: input.targetUserId ?? null,
      targetMessageId: input.targetMessageId ?? null,
      chatId: input.chatId ?? null,
      reason: input.reason,
      details: input.details ?? null,
      status: "OPEN",
    },
  });
}

export async function listAdminReports(input: {
  status?: ReportStatus;
  limit: number;
  cursor?: string;
}): Promise<{ data: AdminReportItem[]; nextCursor: string | null }> {
  const prisma = getPrisma();
  const take = input.limit + 1;

  let cursorFilter: { createdAt: Date; id: string } | undefined;
  if (input.cursor) {
    const decoded = decodeMessageCursor(input.cursor);
    cursorFilter = { createdAt: new Date(decoded.c), id: decoded.i };
  }

  const rows = await prisma.report.findMany({
    where: {
      ...(input.status ? { status: input.status } : {}),
      ...(cursorFilter
        ? {
            OR: [
              { createdAt: { lt: cursorFilter.createdAt } },
              { createdAt: cursorFilter.createdAt, id: { lt: cursorFilter.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: {
      reporter: { select: reportUserSelect },
      targetUser: { select: reportUserSelect },
    },
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeMessageCursor(last.createdAt, last.id) : null;

  return {
    data: page.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      chatId: r.chatId,
      targetMessageId: r.targetMessageId,
      reporter: mapReportUser(r.reporter)!,
      targetUser: mapReportUser(r.targetUser),
    })),
    nextCursor,
  };
}

export async function patchAdminReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<AdminReportItem> {
  const prisma = getPrisma();
  const existing = await prisma.report.findUnique({ where: { id: reportId } });
  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Report not found");
  }

  const reviewedAt =
    status === "OPEN"
      ? null
      : existing.status === "OPEN"
        ? new Date()
        : (existing.reviewedAt ?? new Date());

  const row = await prisma.report.update({
    where: { id: reportId },
    data: {
      status,
      reviewedAt,
    },
    include: {
      reporter: { select: reportUserSelect },
      targetUser: { select: reportUserSelect },
    },
  });

  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    chatId: row.chatId,
    targetMessageId: row.targetMessageId,
    reporter: mapReportUser(row.reporter)!,
    targetUser: mapReportUser(row.targetUser),
  };
}

