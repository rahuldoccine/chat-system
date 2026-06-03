import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

import type { AppConfig } from "../config/index.js";
import type { Logger } from "./logger.js";

const MAIL_FROM_NAME = "Chat System";

export function isSmtpConfigured(config: AppConfig): boolean {
  return Boolean(config.smtp.host && config.smtp.port && config.smtp.from);
}

function formatFromAddress(from: string): string {
  if (from.includes("<")) return from;
  return `"${MAIL_FROM_NAME}" <${from}>`;
}

function createSmtpTransporter(config: AppConfig) {
  const port = config.smtp.port!;
  return nodemailer.createTransport({ // NOSONAR S5332 — SMTP is not HTTP; TLS via secure/requireTLS
    host: config.smtp.host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass } // NOSONAR — credentials from env, not hard-coded
        : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  } satisfies SMTPTransport.Options);
}

export type SmtpEmailContent = {
  subject: string;
  text: string;
  html: string;
};

export async function sendSmtpEmail(
  config: AppConfig,
  logger: Logger,
  to: string,
  content: SmtpEmailContent,
  log: { success: string; failure: string },
): Promise<void> {
  const transporter = createSmtpTransporter(config);

  try {
    await transporter.sendMail({
      from: formatFromAddress(config.smtp.from!),
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    logger.info({ to }, log.success);
  } catch (err) {
    const smtpError = err instanceof Error ? err.message : String(err);
    logger.error({ err, to, smtpError }, log.failure);
    throw err;
  } finally {
    transporter.close();
  }
}
