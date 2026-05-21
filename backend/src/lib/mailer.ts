import nodemailer from "nodemailer";

import type { AppConfig } from "../config/index.js";
import type { Logger } from "./logger.js";

function isSmtpConfigured(config: AppConfig): boolean {
  return Boolean(config.smtp.host && config.smtp.port && config.smtp.from);
}

export async function sendPasswordResetEmail(
  config: AppConfig,
  logger: Logger,
  to: string,
  resetLink: string,
): Promise<void> {
  if (!isSmtpConfigured(config)) {
    logger.warn(
      { to, resetLinkPreview: resetLink.slice(0, 40) },
      "SMTP not configured; password reset email not sent (dev)",
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: "Reset your password",
    text: `You requested a password reset. Open this link (valid for a limited time):\n\n${resetLink}\n\nIf you did not request this, ignore this email.`,
    html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Reset your password</a></p><p>If you did not request this, ignore this email.</p>`,
  });
}

export async function sendRecoveryEmailChallenge(
  config: AppConfig,
  logger: Logger,
  to: string,
  code: string,
): Promise<void> {
  if (!isSmtpConfigured(config)) {
    logger.warn({ to, codePreview: code.slice(0, 2) + "****" }, "SMTP not configured; recovery email not sent (dev)");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: "Your recovery verification code",
    text: `Use this verification code to continue account recovery:\n\n${code}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use this verification code to continue account recovery:</p><p><b style="font-size:18px; letter-spacing:2px;">${code}</b></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}
