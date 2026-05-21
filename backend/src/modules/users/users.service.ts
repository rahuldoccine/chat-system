import type { User } from "@prisma/client";

import { loadConfig } from "../../config/index.js";
import { AppError } from "../../errors/index.js";
import { deleteReplacedAvatarUpload } from "../../lib/upload-cleanup.js";
import { getPrisma } from "../../lib/prisma.js";

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  publicKey: string | null;
  keyVersion: number | null;
  isAdmin: boolean;
  createdAt: Date;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    publicKey: user.publicKey,
    keyVersion: user.keyVersion,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

export async function getMe(userId: string): Promise<PublicUser> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  return toPublicUser(user);
}

export async function patchMe(userId: string, data: {
  displayName?: string;
  username?: string | null;
  avatarUrl?: string | null;
  publicKey?: string | null;
  keyVersion?: number | null;
}): Promise<PublicUser> {
  const prisma = getPrisma();
  const previousAvatarUrl =
    data.avatarUrl !== undefined
      ? (
          await prisma.user.findUnique({
            where: { id: userId },
            select: { avatarUrl: true },
          })
        )?.avatarUrl ?? null
      : undefined;

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.publicKey !== undefined ? { publicKey: data.publicKey } : {}),
        ...(data.keyVersion !== undefined ? { keyVersion: data.keyVersion } : {}),
      },
    });

    if (data.avatarUrl !== undefined && previousAvatarUrl !== undefined) {
      const { uploadDir } = loadConfig();
      await deleteReplacedAvatarUpload(uploadDir, previousAvatarUrl, data.avatarUrl);
    }

    return toPublicUser(user);
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
    if (code === "P2002") {
      throw new AppError(409, "USERNAME_TAKEN", "Username is already taken");
    }
    throw e;
  }
}

export async function getUserById(viewerId: string, targetId: string): Promise<PublicUser> {
  const prisma = getPrisma();
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: targetId },
        { blockerId: targetId, blockedId: viewerId },
      ],
    },
  });
  if (blocked) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user || user.deletedAt) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  return toPublicUser(user);
}

export async function searchUsers(viewerId: string, q: string, limit: number): Promise<PublicUser[]> {
  const prisma = getPrisma();
  const blockedIds = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const hide = new Set<string>();
  for (const b of blockedIds) {
    hide.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
  }
  const term = q.trim().toLowerCase();
  const excludeIds = [...hide, viewerId];
  const users = await prisma.user.findMany({
    where: {
      id: { notIn: excludeIds },
      deletedAt: null,
      ...(term.length > 0
        ? {
            OR: [
              { email: { contains: term, mode: "insensitive" } },
              { username: { contains: term, mode: "insensitive" } },
              { displayName: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
  return users.map(toPublicUser);
}

export async function getOrCreateSettings(userId: string) {
  const prisma = getPrisma();
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function patchSettings(
  userId: string,
  data: Partial<{ notifyPush: boolean; notifyEmail: boolean; showReadReceipts: boolean }>,
) {
  const prisma = getPrisma();
  await getOrCreateSettings(userId);
  return prisma.userSettings.update({
    where: { userId },
    data,
  });
}
