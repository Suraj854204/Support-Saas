import { escapeHtml } from "./shared";

export interface EscalationNoticeTemplateInput {
  agentName: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketUrl: string;
  minutesPastDue: number;
}

export function escalationNoticeTemplate({
  agentName,
  ticketNumber,
  ticketSubject,
  ticketUrl,
  minutesPastDue,
}: EscalationNoticeTemplateInput): { subject: string; html: string; text: string } {
  const subject = `Escalated to you: ${ticketNumber}`;
  const hoursPastDue = Math.round(minutesPastDue / 6) / 10; // one decimal place

  const text = `Hi ${agentName},

An SLA-breached ticket has been escalated and reassigned to you.

Ticket: ${ticketNumber} — ${ticketSubject}
Breached ${hoursPastDue} hours ago

${ticketUrl}

— SupportFlow`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hi ${escapeHtml(agentName)},</p>
      <p>An SLA-breached ticket has been escalated and reassigned to you.</p>
      <p>
        <strong>Ticket:</strong> ${escapeHtml(ticketNumber)} — ${escapeHtml(ticketSubject)}<br />
        <strong>Breached:</strong> ${hoursPastDue} hours ago
      </p>
      <p style="margin: 24px 0;">
        <a href="${ticketUrl}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Open ticket</a>
      </p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">— SupportFlow</p>
    </div>
  `;

  return { subject, html, text };
}
