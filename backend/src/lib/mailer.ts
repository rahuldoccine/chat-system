import type { AppConfig } from "../config/index.js";
import { buildPasswordResetEmail, buildRecoveryCodeEmail } from "./email/templates.js";
import type { Logger } from "./logger.js";
import { isSmtpConfigured, sendSmtpEmail } from "./send-smtp-email.js";

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

  const content = buildPasswordResetEmail({
    resetLink,
    expiresMinutes: config.passwordResetTokenTtlMinutes,
  });

  await sendSmtpEmail(config, logger, to, content, {
    success: "Password reset email sent",
    failure: "Failed to send password reset email",
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

  const content = buildRecoveryCodeEmail({ code });

  await sendSmtpEmail(config, logger, to, content, {
    success: "Recovery verification email sent",
    failure: "Failed to send recovery verification email",
  });
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
