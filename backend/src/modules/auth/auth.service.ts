import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import type { AppConfig } from "../../config/index.js";
import { AppError } from "../../errors/index.js";
import { signAccessTokenWithExpiry } from "../../lib/jwt.js";
import { sendPasswordResetEmail } from "../../lib/mailer.js";
import type { Logger } from "../../lib/logger.js";
import { hashOpaqueToken, newOpaqueToken } from "../../lib/opaque-token.js";
import { getPrisma } from "../../lib/prisma.js";

export type SessionMeta = { userAgent?: string; ip?: string };

const DUMMY_BCRYPT =
  "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G9./MqEag74nGC";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetTokenSecret(config: AppConfig): string {
  return `${config.jwtAccessSecret}:password-reset`;
}

async function issueSession(
  config: AppConfig,
  userId: string,
  email: string,
  meta: SessionMeta,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { authVersion: true },
  });

  const rawRefresh = newOpaqueToken();
  const tokenHash = hashOpaqueToken(rawRefresh, config.jwtRefreshSecret);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.refreshTokenExpiresDays);

  await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipLast: meta.ip ?? null,
    },
  });

  const { token: accessToken, expiresIn } = signAccessTokenWithExpiry(
    { sub: userId, email, authVer: user.authVersion },
    config,
  );
  return { accessToken, refreshToken: rawRefresh, expiresIn };
}

export async function registerUser(
  config: AppConfig,
  input: { email: string; password: string; name?: string },
  meta: SessionMeta,
): Promise<{
  user: { id: string; email: string; displayName: string | null; createdAt: Date };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const prisma = getPrisma();
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  try {
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash, displayName: input.name },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    const tokens = await issueSession(config, user.id, user.email, meta);
    return { user, ...tokens };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError(409, "EMAIL_TAKEN", "Email already registered");
    }
    throw e;
  }
}

export async function loginUser(
  config: AppConfig,
  input: { email: string; password: string },
  meta: SessionMeta,
): Promise<{
  user: { id: string; email: string; displayName: string | null; createdAt: Date };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, displayName: true, passwordHash: true, createdAt: true },
  });

  const valid =
    user !== null && (await bcrypt.compare(input.password, user.passwordHash));
  if (!valid) {
    await bcrypt.compare("x", DUMMY_BCRYPT);
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const tokens = await issueSession(config, user.id, user.email, meta);
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
    ...tokens,
  };
}

export async function refreshTokens(
  config: AppConfig,
  rawRefresh: string | undefined,
  meta: SessionMeta,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  if (!rawRefresh?.trim()) {
    throw new AppError(401, "NO_REFRESH", "Refresh token required");
  }
  const prisma = getPrisma();
  const tokenHash = hashOpaqueToken(rawRefresh, config.jwtRefreshSecret);
  const session = await prisma.refreshSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: { select: { id: true, email: true, authVersion: true } } },
  });

  if (!session) {
    throw new AppError(401, "INVALID_REFRESH", "Invalid or expired refresh token");
  }

  const newRaw = newOpaqueToken();
  const newHash = hashOpaqueToken(newRaw, config.jwtRefreshSecret);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.refreshTokenExpiresDays);

  await prisma.refreshSession.update({
    where: { id: session.id },
    data: {
      tokenHash: newHash,
      expiresAt,
      lastUsedAt: new Date(),
      userAgent: meta.userAgent ?? session.userAgent,
      ipLast: meta.ip ?? session.ipLast,
    },
  });

  const { token: accessToken, expiresIn } = signAccessTokenWithExpiry(
    {
      sub: session.user.id,
      email: session.user.email,
      authVer: session.user.authVersion,
    },
    config,
  );
  return { accessToken, refreshToken: newRaw, expiresIn };
}

/** Idempotent: removes session row when a valid refresh is supplied; no-op when missing (cookie already cleared client-side). */
export async function logoutSession(
  config: AppConfig,
  rawRefresh: string | undefined,
): Promise<void> {
  if (!rawRefresh?.trim()) {
    return;
  }
  const prisma = getPrisma();
  const tokenHash = hashOpaqueToken(rawRefresh, config.jwtRefreshSecret);
  await prisma.refreshSession.deleteMany({ where: { tokenHash } });
}

export async function logoutAllSessions(userId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.refreshSession.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { authVersion: { increment: 1 } },
    }),
  ]);
}

export async function forgotPassword(
  config: AppConfig,
  logger: Logger,
  email: string,
): Promise<void> {
  await delay(400);
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }

  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  const raw = newOpaqueToken();
  const tokenHash = hashOpaqueToken(raw, resetTokenSecret(config));
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + config.passwordResetTokenTtlMinutes);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const resetLink = `${config.frontendUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(raw)}`;
  await sendPasswordResetEmail(config, logger, user.email, resetLink);
}

export async function resetPasswordWithToken(
  config: AppConfig,
  input: { token: string; newPassword: string },
): Promise<void> {
  const prisma = getPrisma();
  const tokenHash = hashOpaqueToken(input.token, resetTokenSecret(config));
  const row = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!row) {
    throw new AppError(400, "INVALID_RESET_TOKEN", "Invalid or expired reset token");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, config.bcryptRounds);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshSession.deleteMany({ where: { userId: row.userId } }),
    prisma.user.update({
      where: { id: row.userId },
      data: { authVersion: { increment: 1 } },
    }),
  ]);
}
