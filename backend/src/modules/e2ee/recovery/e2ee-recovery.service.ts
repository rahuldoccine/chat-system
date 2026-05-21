import { AppError } from "../../../errors/index.js";
import type { AppConfig } from "../../../config/index.js";
import type { Logger } from "../../../lib/logger.js";
import { hashOpaqueToken, newOpaqueToken } from "../../../lib/opaque-token.js";
import { getPrisma } from "../../../lib/prisma.js";
import { sendRecoveryEmailChallenge } from "../../../lib/mailer.js";

const PURPOSE_RECOVERY = "E2EE_RECOVERY";
const CODE_TTL_MS = 10 * 60_000;
const STEP_UP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;

function newEmailCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, "0");
}

export async function upsertKeyBackup(
  userId: string,
  input: { version: number; wrapAlg: string; wrappedPrivateKeyMaterial: string },
) {
  const prisma = getPrisma();
  return prisma.keyBackup.upsert({
    where: { userId },
    create: {
      userId,
      version: input.version,
      wrapAlg: input.wrapAlg,
      wrappedPrivateKeyMaterial: input.wrappedPrivateKeyMaterial,
    },
    update: {
      version: input.version,
      wrapAlg: input.wrapAlg,
      wrappedPrivateKeyMaterial: input.wrappedPrivateKeyMaterial,
    },
  });
}

export async function issueRecoveryEmailChallenge(userId: string, config: AppConfig, logger: Logger): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  if (!user.emailVerifiedAt) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Email verification required");
  }

  const code = newEmailCode();
  const codeHash = hashOpaqueToken(code, config.jwtAccessSecret);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.emailChallenge.create({
    data: {
      userId,
      purpose: PURPOSE_RECOVERY,
      codeHash,
      expiresAt,
    },
  });

  await sendRecoveryEmailChallenge(config, logger, user.email, code);
}

export async function verifyRecoveryEmailCode(
  userId: string,
  code: string,
  config: AppConfig,
): Promise<{ stepUpToken: string; expiresAt: Date }> {
  const prisma = getPrisma();
  const now = new Date();
  const challenge = await prisma.emailChallenge.findFirst({
    where: { userId, purpose: PURPOSE_RECOVERY, expiresAt: { gt: now }, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) {
    throw new AppError(400, "NO_CHALLENGE", "No active email challenge");
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    throw new AppError(429, "TOO_MANY_ATTEMPTS", "Too many attempts");
  }

  const codeHash = hashOpaqueToken(code, config.jwtAccessSecret);
  if (codeHash !== challenge.codeHash) {
    await prisma.emailChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, "INVALID_CODE", "Invalid code");
  }

  const stepUpToken = newOpaqueToken();
  const tokenHash = hashOpaqueToken(stepUpToken, config.jwtAccessSecret);
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.emailChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date() } });
    await tx.stepUpToken.create({ data: { userId, tokenHash, expiresAt } });
  });

  return { stepUpToken, expiresAt };
}

export async function requireStepUpToken(userId: string, rawToken: string, config: AppConfig): Promise<void> {
  const prisma = getPrisma();
  const tokenHash = hashOpaqueToken(rawToken, config.jwtAccessSecret);
  const now = new Date();
  const row = await prisma.stepUpToken.findUnique({ where: { tokenHash } });
  if (!row || row.userId !== userId) {
    throw new AppError(403, "STEP_UP_REQUIRED", "Step-up verification required");
  }
  if (row.consumedAt) {
    throw new AppError(403, "STEP_UP_REQUIRED", "Step-up verification required");
  }
  if (row.expiresAt <= now) {
    throw new AppError(403, "STEP_UP_EXPIRED", "Step-up verification expired");
  }
  await prisma.stepUpToken.update({ where: { tokenHash }, data: { consumedAt: new Date() } });
}

export async function getKeyBackup(userId: string) {
  const prisma = getPrisma();
  const row = await prisma.keyBackup.findUnique({
    where: { userId },
    select: { userId: true, version: true, wrapAlg: true, wrappedPrivateKeyMaterial: true, updatedAt: true },
  });
  if (!row) {
    throw new AppError(404, "NOT_FOUND", "No key backup found");
  }
  return row;
}

