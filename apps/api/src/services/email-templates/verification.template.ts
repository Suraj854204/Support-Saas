import { escapeHtml } from "./shared";

export interface VerificationTemplateInput {
  name: string;
  verifyUrl: string;
  expiresInHours: number;
}

export function verificationTemplate({ name, verifyUrl, expiresInHours }: VerificationTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Verify your SupportFlow email address";

  const text = `Hi ${name},

Please verify your email address to unlock Gmail connections, billing, and team invitations:

${verifyUrl}

This link expires in ${expiresInHours} hours. If you didn't create a SupportFlow account, you can ignore this email.

— SupportFlow`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hi ${escapeHtml(name)},</p>
      <p>Please verify your email address to unlock Gmail connections, billing, and team invitations.</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Verify email</a>
      </p>
      <p>Or paste this link into your browser:<br /><span style="word-break: break-all;">${escapeHtml(verifyUrl)}</span></p>
      <p>This link expires in ${expiresInHours} hours. If you didn't create a SupportFlow account, you can ignore this email.</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">— SupportFlow</p>
    </div>
  `;

  return { subject, html, text };
}
