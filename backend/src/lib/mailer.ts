import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

import type { AppConfig } from "../config/index.js";
import { buildPasswordResetEmail, buildRecoveryCodeEmail } from "./email/templates.js";
import type { Logger } from "./logger.js";

const MAIL_FROM_NAME = "Chat System";

function isSmtpConfigured(config: AppConfig): boolean {
  return Boolean(config.smtp.host && config.smtp.port && config.smtp.from);
}

function formatFromAddress(from: string): string {
  if (from.includes("<")) return from;
  return `"${MAIL_FROM_NAME}" <${from}>`;
}

function createSmtpTransporter(config: AppConfig) {
  const port = config.smtp.port!;
  return nodemailer.createTransport({
    host: config.smtp.host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  } satisfies SMTPTransport.Options);
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

  const { subject, text, html } = buildPasswordResetEmail({
    resetLink,
    expiresMinutes: config.passwordResetTokenTtlMinutes,
  });

  const transporter = createSmtpTransporter(config);

  try {
    await transporter.sendMail({
      from: formatFromAddress(config.smtp.from!),
      to,
      subject,
      text,
      html,
    });
    logger.info({ to }, "Password reset email sent");
  } catch (err) {
    const smtpError = err instanceof Error ? err.message : String(err);
    logger.error({ err, to, smtpError }, "Failed to send password reset email");
    throw err;
  } finally {
    transporter.close();
  }
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

  const { subject, text, html } = buildRecoveryCodeEmail({ code });

  const transporter = createSmtpTransporter(config);

  try {
    await transporter.sendMail({
      from: formatFromAddress(config.smtp.from!),
      to,
      subject,
      text,
      html,
    });
    logger.info({ to }, "Recovery verification email sent");
  } catch (err) {
    const smtpError = err instanceof Error ? err.message : String(err);
    logger.error({ err, to, smtpError }, "Failed to send recovery verification email");
    throw err;
  } finally {
    transporter.close();
  }
}

/** Fire-and-forget wrapper so auth endpoints respond before SMTP finishes. */
export function sendPasswordResetEmailAsync(
  config: AppConfig,
  logger: Logger,
  to: string,
  resetLink: string,
): void {
  void sendPasswordResetEmail(config, logger, to, resetLink).catch(() => {
    // Errors already logged in sendPasswordResetEmail
  });
}
