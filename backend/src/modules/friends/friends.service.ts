import type { Friend, FriendStatus, Prisma } from "@prisma/client";

import { AppError } from "../../errors/index.js";
import { assertNotBlockedPair } from "../../lib/moderation-guard.js";
import { getPrisma } from "../../lib/prisma.js";
import { pairKeyForUserIds } from "../../lib/pair-key.js";
import { toPublicUser, type PublicUser } from "../users/users.service.js";

export type FriendListItemDto = {
  friendId: string;
  user: PublicUser;
  status: FriendStatus;
  createdAt: Date;
  respondedAt: Date | null;
};

function otherUserId(row: Friend, viewerId: string): string {
  return row.requesterId === viewerId ? row.addresseeId : row.requesterId;
}

function friendListWhere(
  viewerId: string,
  status: "accepted" | "incoming" | "outgoing",
): Prisma.FriendWhereInput {
  if (status === "accepted") {
    return {
      status: "ACCEPTED",
      OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
    };
  }
  if (status === "incoming") {
    return { status: "PENDING", addresseeId: viewerId };
  }
  return { status: "PENDING", requesterId: viewerId };
}

export async function listFriends(
  viewerId: string,
  status: "accepted" | "incoming" | "outgoing",
): Promise<FriendListItemDto[]> {
  const prisma = getPrisma();
  const where = friendListWhere(viewerId, status);

  const rows = await prisma.friend.findMany({
    where,
    orderBy:
      status === "accepted"
        ? [{ respondedAt: "desc" }, { createdAt: "desc" }]
        : { createdAt: "desc" },
  });

  const otherIds = [...new Set(rows.map((r) => otherUserId(r, viewerId)))];
  if (otherIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: otherIds }, deletedAt: null },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return rows
    .map((row) => {
      const oid = otherUserId(row, viewerId);
      const u = userById.get(oid);
      if (!u) return null;
      return {
        friendId: row.id,
        user: toPublicUser(u),
        status: row.status,
        createdAt: row.createdAt,
        respondedAt: row.respondedAt,
      };
    })
    .filter((x): x is FriendListItemDto => Boolean(x));
}

export async function cancelFriendRequest(userId: string, friendId: string): Promise<void> {
  const prisma = getPrisma();
  const row = await prisma.friend.findUnique({ where: { id: friendId } });
  if (row?.status !== "PENDING" || row?.requesterId !== userId) {
    throw new AppError(404, "NOT_FOUND", "Friend request not found");
  }
  await prisma.friend.delete({ where: { id: friendId } });
}

export async function requestFriend(
  requesterId: string,
  input: { addresseeId?: string; email?: string },
): Promise<{ friend: Friend; created: boolean }> {
  const prisma = getPrisma();
  let addresseeId = input.addresseeId;
  if (!addresseeId && input.email) {
    const u = await prisma.user.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" }, deletedAt: null },
    });
    if (!u) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }
    addresseeId = u.id;
  }
  if (!addresseeId) {
    throw new AppError(400, "VALIDATION_ERROR", "addresseeId or email required");
  }
  if (addresseeId === requesterId) {
    throw new AppError(400, "INVALID", "Cannot friend yourself");
  }
  await assertNotBlockedPair(requesterId, addresseeId);
  const addressee = await prisma.user.findUnique({ where: { id: addresseeId } });
  if (!addressee || addressee.deletedAt) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }

  const pairKey = pairKeyForUserIds(requesterId, addresseeId);
  const existing = await prisma.friend.findUnique({ where: { pairKey } });
  if (existing) {
    if (existing.status === "ACCEPTED") {
      return { friend: existing, created: false };
    }
    if (existing.status === "PENDING") {
      return { friend: existing, created: false };
    }
    const updated = await prisma.friend.update({
      where: { pairKey },
      data: {
        requesterId,
        addresseeId,
        status: "PENDING",
        respondedAt: null,
      },
    });
    return { friend: updated, created: true };
  }

  const friend = await prisma.friend.create({
    data: {
      pairKey,
      requesterId,
      addresseeId,
      status: "PENDING",
    },
  });
  return { friend, created: true };
}

export async function acceptFriend(userId: string, friendId: string) {
  const prisma = getPrisma();
  const row = await prisma.friend.findUnique({ where: { id: friendId } });
  if (row?.status !== "PENDING" || row?.addresseeId !== userId) {
    throw new AppError(404, "NOT_FOUND", "Friend request not found");
  }
  return prisma.friend.update({
    where: { id: friendId },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });
}

export async function rejectFriend(userId: string, friendId: string) {
  const prisma = getPrisma();
  const row = await prisma.friend.findUnique({ where: { id: friendId } });
  if (row?.status !== "PENDING" || row?.addresseeId !== userId) {
    throw new AppError(404, "NOT_FOUND", "Friend request not found");
  }
  return prisma.friend.update({
    where: { id: friendId },
    data: { status: "REJECTED", respondedAt: new Date() },
  });
}

export async function removeFriend(userId: string, otherUserId: string) {
  const prisma = getPrisma();
  const pairKey = pairKeyForUserIds(userId, otherUserId);
  const row = await prisma.friend.findUnique({ where: { pairKey } });
  if (row?.status !== "ACCEPTED") {
    throw new AppError(404, "NOT_FOUND", "Friendship not found");
  }
  if (row.requesterId !== userId && row.addresseeId !== userId) {
    throw new AppError(403, "FORBIDDEN", "Not part of this friendship");
  }
  await prisma.friend.delete({ where: { pairKey } });
}
