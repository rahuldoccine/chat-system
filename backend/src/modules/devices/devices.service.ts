import type { DevicePlatform } from "@prisma/client";

import { AppError } from "../../errors/index.js";
import { getPrisma } from "../../lib/prisma.js";

export type WebPushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Store Web Push subscription JSON as device token (platform WEB). */
export async function registerWebPushSubscription(userId: string, sub: WebPushSubscriptionInput) {
  const token = JSON.stringify({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return registerDeviceToken(userId, token, "WEB");
}

export async function registerDeviceToken(userId: string, token: string, platform: DevicePlatform) {
  const prisma = getPrisma();
  return prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform, revokedAt: null, lastUsedAt: new Date() },
  });
}

export async function revokeDeviceToken(userId: string, token: string) {
  const prisma = getPrisma();
  const row = await prisma.deviceToken.findUnique({ where: { token } });
  if (row?.userId !== userId) {
    throw new AppError(404, "NOT_FOUND", "Device token not found");
  }
  return prisma.deviceToken.update({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

export async function listDeviceTokens(userId: string) {
  const prisma = getPrisma();
  return prisma.deviceToken.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, platform: true, createdAt: true, lastUsedAt: true },
  });
}

export async function markDeviceTokenRevokedByFcm(token: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.deviceToken.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
