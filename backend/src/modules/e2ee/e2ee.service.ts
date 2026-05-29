import { AppError } from "../../errors/index.js";
import { getPrisma } from "../../lib/prisma.js";

export async function upsertIdentityKey(
  userId: string,
  input: { publicKey: string; fingerprint: string },
  options?: { allowRotation?: boolean },
) {
  const prisma = getPrisma();
  const existing = await prisma.userIdentityKey.findUnique({
    where: { userId },
    select: { fingerprint: true, revokedAt: true },
  });
  if (
    existing &&
    !existing.revokedAt &&
    existing.fingerprint !== input.fingerprint &&
    !options?.allowRotation
  ) {
    throw new AppError(
      409,
      "IDENTITY_EXISTS",
      "Identity key already registered; restore keys instead of creating new ones",
    );
  }
  return prisma.userIdentityKey.upsert({
    where: { userId },
    create: { userId, publicKey: input.publicKey, fingerprint: input.fingerprint },
    update: { publicKey: input.publicKey, fingerprint: input.fingerprint, revokedAt: null },
  });
}

export async function hasIdentityKey(userId: string): Promise<boolean> {
  const prisma = getPrisma();
  const row = await prisma.userIdentityKey.findUnique({
    where: { userId },
    select: { revokedAt: true },
  });
  return Boolean(row && !row.revokedAt);
}

export async function getIdentityKeySummary(userId: string): Promise<{
  hasIdentityKey: boolean;
  fingerprint: string | null;
  deviceCount: number;
}> {
  const prisma = getPrisma();
  const identity = await prisma.userIdentityKey.findUnique({
    where: { userId },
    select: { fingerprint: true, revokedAt: true },
  });
  const deviceCount = await prisma.deviceKey.count({
    where: { userId, revokedAt: null },
  });
  return {
    hasIdentityKey: Boolean(identity && !identity.revokedAt),
    fingerprint: identity && !identity.revokedAt ? identity.fingerprint : null,
    deviceCount,
  };
}

export async function getIdentityKey(userId: string) {
  const prisma = getPrisma();
  const row = await prisma.userIdentityKey.findUnique({
    where: { userId },
    select: { userId: true, publicKey: true, fingerprint: true, createdAt: true, updatedAt: true, revokedAt: true },
  });
  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Identity key not found");
  }
  return row;
}

export async function upsertDeviceKey(
  userId: string,
  deviceId: string,
  input: { publicKey: string; label?: string },
) {
  const prisma = getPrisma();
  return prisma.deviceKey.upsert({
    where: { deviceId },
    create: { userId, deviceId, publicKey: input.publicKey, label: input.label },
    update: { userId, publicKey: input.publicKey, label: input.label, revokedAt: null },
  });
}

export async function listUserDevices(userId: string) {
  const prisma = getPrisma();
  return prisma.deviceKey.findMany({
    where: { userId, revokedAt: null },
    select: { deviceId: true, publicKey: true, label: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function publishPreKeys(
  userId: string,
  deviceId: string,
  input: {
    signedPreKey: { keyId: string; publicKey: string; signature: string };
    oneTimePreKeys: { keyId: string; publicKey: string }[];
  },
) {
  const prisma = getPrisma();
  const device = await prisma.deviceKey.findUnique({ where: { deviceId } });
  if (!device || device.revokedAt) {
    throw new AppError(404, "NOT_FOUND", "Device key not found");
  }
  if (device.userId !== userId) {
    throw new AppError(403, "FORBIDDEN", "Cannot publish prekeys for another user");
  }

  await prisma.$transaction(async (tx) => {
    const spkWhere = { deviceId_keyId: { deviceId, keyId: input.signedPreKey.keyId } };
    const existingSigned = await tx.signedPreKey.findUnique({ where: spkWhere });

    // One active signed pre-key per device so fetchPreKeyBundle cannot return a stale key.
    await tx.signedPreKey.updateMany({
      where: { deviceId, keyId: { not: input.signedPreKey.keyId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (!existingSigned) {
      await tx.signedPreKey.create({
        data: {
          deviceId,
          keyId: input.signedPreKey.keyId,
          publicKey: input.signedPreKey.publicKey,
          signature: input.signedPreKey.signature,
        },
      });
    } else if (
      existingSigned.publicKey !== input.signedPreKey.publicKey ||
      existingSigned.signature !== input.signedPreKey.signature
    ) {
      await tx.signedPreKey.update({
        where: spkWhere,
        data: {
          publicKey: input.signedPreKey.publicKey,
          signature: input.signedPreKey.signature,
          revokedAt: null,
        },
      });
    }

    if (input.oneTimePreKeys.length) {
      await tx.oneTimePreKey.createMany({
        data: input.oneTimePreKeys.map((k) => ({ deviceId, keyId: k.keyId, publicKey: k.publicKey })),
        skipDuplicates: true,
      });
    }
  });
}

export async function fetchPreKeyBundle(targetUserId: string, deviceId: string) {
  const prisma = getPrisma();
  const identity = await prisma.userIdentityKey.findUnique({
    where: { userId: targetUserId },
    select: { publicKey: true, fingerprint: true, updatedAt: true, revokedAt: true },
  });
  if (!identity || identity.revokedAt) {
    throw new AppError(404, "NOT_FOUND", "Identity key not found");
  }
  const device = await prisma.deviceKey.findUnique({
    where: { deviceId },
    select: { deviceId: true, userId: true, publicKey: true, label: true, revokedAt: true },
  });
  if (!device || device.revokedAt || device.userId !== targetUserId) {
    throw new AppError(404, "NOT_FOUND", "Device not found");
  }

  const bundle = await prisma.$transaction(async (tx) => {
    const signed = await tx.signedPreKey.findFirst({
      where: { deviceId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!signed) {
      throw new AppError(404, "NOT_FOUND", "Signed prekey not found");
    }

    const oneTime = await tx.oneTimePreKey.findFirst({
      where: { deviceId, consumedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (oneTime) {
      await tx.oneTimePreKey.update({
        where: { id: oneTime.id },
        data: { consumedAt: new Date() },
      });
    }
    return { signed, oneTime };
  });

  return {
    identityKey: identity,
    deviceKey: { deviceId: device.deviceId, publicKey: device.publicKey, label: device.label ?? null },
    signedPreKey: {
      keyId: bundle.signed.keyId,
      publicKey: bundle.signed.publicKey,
      signature: bundle.signed.signature,
    },
    oneTimePreKey: bundle.oneTime
      ? { keyId: bundle.oneTime.keyId, publicKey: bundle.oneTime.publicKey }
      : null,
  };
}

