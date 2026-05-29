import { escapeHtml } from "./escape.js";

const APP_NAME = "Chat System";
const BRAND_COLOR = "#4f46e5";
const BRAND_GRADIENT_END = "#7c3aed";

type EmailLayoutOptions = {
  previewText: string;
  title: string;
  bodyHtml: string;
  footerNote?: string;
};

function emailLayout({ previewText, title, bodyHtml, footerNote }: EmailLayoutOptions): string {
  const year = new Date().getFullYear();
  const footer = footerNote
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#64748b;">${footerNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]><style type="text/css">body,table,td{font-family:Segoe UI,Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 20px;text-align:center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_GRADIENT_END});text-align:center;vertical-align:middle;">
                    <span style="font-size:22px;line-height:44px;color:#ffffff;">&#128172;</span>
                  </td>
                  <td style="padding-left:12px;text-align:left;vertical-align:middle;">
                    <span style="font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">${APP_NAME}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(15,23,42,0.06);overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,${BRAND_COLOR},${BRAND_GRADIENT_END});font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:32px 28px 28px;">
                    ${bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
                &copy; ${year} ${APP_NAME}. Secure messaging for teams.
              </p>
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export type PasswordResetEmailContent = {
  resetLink: string;
  expiresMinutes: number;
};

export function buildPasswordResetEmail(content: PasswordResetEmailContent): {
  subject: string;
  text: string;
  html: string;
} {
  const { resetLink, expiresMinutes } = content;
  const safeLink = escapeHtml(resetLink);
  const subject = `Reset your ${APP_NAME} password`;

  const text = [
    `Hello,`,
    ``,
    `We received a request to reset the password for your ${APP_NAME} account.`,
    ``,
    `Reset your password (link expires in ${expiresMinutes} minutes):`,
    resetLink,
    ``,
    `If you did not request this, you can safely ignore this email. Your password will not change.`,
    ``,
    `— ${APP_NAME}`,
  ].join("\n");

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">Reset your password</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">
      We received a request to reset the password for your <strong style="color:#0f172a;">${APP_NAME}</strong> account.
      Click the button below to choose a new password.
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
      <tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_GRADIENT_END});">
          <a href="${safeLink}" target="_blank" rel="noopener noreferrer"
            style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
            Reset password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#64748b;">
      This link expires in <strong style="color:#334155;">${expiresMinutes} minutes</strong> for your security.
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748b;">
      If the button does not work, copy and paste this URL into your browser:
    </p>
    <p style="margin:0 0 20px;font-size:12px;line-height:1.5;word-break:break-all;">
      <a href="${safeLink}" style="color:${BRAND_COLOR};text-decoration:underline;">${safeLink}</a>
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
            <strong style="color:#334155;">Did not request this?</strong>
            You can ignore this email. Your password will stay the same.
          </p>
        </td>
      </tr>
    </table>`;

  const html = emailLayout({
    previewText: `Reset your ${APP_NAME} password. Link expires in ${expiresMinutes} minutes.`,
    title: subject,
    bodyHtml,
    footerNote: "You received this email because a password reset was requested for your account.",
  });

  return { subject, text, html };
}

export type RecoveryCodeEmailContent = {
  code: string;
  expiresMinutes?: number;
};

export function buildRecoveryCodeEmail(content: RecoveryCodeEmailContent): {
  subject: string;
  text: string;
  html: string;
} {
  const { code, expiresMinutes = 15 } = content;
  const safeCode = escapeHtml(code);
  const subject = `Your ${APP_NAME} verification code`;

  const text = [
    `Hello,`,
    ``,
    `Your verification code for account recovery is:`,
    ``,
    code,
    ``,
    `This code expires in ${expiresMinutes} minutes.`,
    ``,
    `If you did not request this, ignore this email.`,
    ``,
    `— ${APP_NAME}`,
  ].join("\n");

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">Verification code</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">
      Use this code to continue account recovery on <strong style="color:#0f172a;">${APP_NAME}</strong>:
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
      <tr>
        <td align="center" style="padding:20px;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;font-family:ui-monospace,Consolas,monospace;">${safeCode}</span>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
      This code expires in <strong style="color:#334155;">${expiresMinutes} minutes</strong>.
      Do not share it with anyone.
    </p>`;

  const html = emailLayout({
    previewText: `Your ${APP_NAME} verification code is ${code}.`,
    title: subject,
    bodyHtml,
    footerNote: "You received this email because account recovery was started on your account.",
  });

  return { subject, text, html };
}
