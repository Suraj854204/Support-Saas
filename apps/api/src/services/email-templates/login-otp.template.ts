import { escapeHtml } from "./shared";

export interface LoginOtpTemplateInput {
  name: string;
  otp: string;
  expiresInMinutes: number;
}

export function loginOtpTemplate({ name, otp, expiresInMinutes }: LoginOtpTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Your SupportFlow sign-in code";

  const text = `Hi ${name},

Your sign-in verification code is: ${otp}

This code expires in ${expiresInMinutes} minutes. If you didn't try to sign in, you can safely ignore this email.

— SupportFlow`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your sign-in verification code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; margin: 24px 0;">${escapeHtml(otp)}</p>
      <p>This code expires in ${expiresInMinutes} minutes. If you didn't try to sign in, you can safely ignore this email.</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">— SupportFlow</p>
    </div>
  `;

  return { subject, html, text };
}
