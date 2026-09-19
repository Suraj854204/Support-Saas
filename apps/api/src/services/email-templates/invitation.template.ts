import { escapeHtml } from "./shared";

export interface InvitationTemplateInput {
  organizationName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function invitationTemplate({
  organizationName,
  inviterName,
  role,
  acceptUrl,
  expiresInDays,
}: InvitationTemplateInput): { subject: string; html: string; text: string } {
  const subject = `You've been invited to join ${organizationName} on SupportFlow`;

  const text = `Hi,

${inviterName} invited you to join ${organizationName} on SupportFlow as a${
    role === "admin" ? "n" : ""
  } ${role}.

Accept the invitation and set your password:
${acceptUrl}

This invitation expires in ${expiresInDays} days. If you weren't expecting this, you can ignore this email.

— SupportFlow`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hi,</p>
      <p>${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(
        organizationName
      )}</strong> on SupportFlow as a${role === "admin" ? "n" : ""} <strong>${escapeHtml(role)}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${acceptUrl}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Accept invitation</a>
      </p>
      <p>Or paste this link into your browser:<br /><span style="word-break: break-all;">${escapeHtml(acceptUrl)}</span></p>
      <p>This invitation expires in ${expiresInDays} days. If you weren't expecting this, you can ignore this email.</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">— SupportFlow</p>
    </div>
  `;

  return { subject, html, text };
}
