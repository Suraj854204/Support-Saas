import { escapeHtml } from "./shared";

export type StatusTransitionType = "status_changed" | "reopened";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  pending: "Waiting on you",
  on_hold: "On hold",
  solved: "Resolved",
  closed: "Closed",
};

function explanationFor(newStatus: string, transitionType: StatusTransitionType): string {
  if (transitionType === "reopened") {
    return "Your ticket has been reopened and our team is looking into it again.";
  }
  switch (newStatus) {
    case "open":
      return "Your ticket is open and waiting for our team to take a look.";
    case "pending":
      return "We're waiting on a bit more information from you to keep helping.";
    case "on_hold":
      return "Your ticket has been placed on hold for now.";
    case "solved":
      return "Your ticket has been marked as resolved. If anything's still not right, just reply to this email.";
    case "closed":
      return "Your ticket has been closed.";
    default:
      return "Your ticket's status has been updated.";
  }
}

export interface TicketStatusTemplateInput {
  ticketNumber: string;
  subject: string;
  previousStatus: string;
  newStatus: string;
  transitionType: StatusTransitionType;
  trackingUrl: string;
  organizationName: string;
  /** Most recent public agent reply, if any — included for context. */
  latestPublicReply?: string | null;
}

export function ticketStatusTemplate({
  ticketNumber,
  subject,
  previousStatus,
  newStatus,
  transitionType,
  trackingUrl,
  organizationName,
  latestPublicReply,
}: TicketStatusTemplateInput): { subject: string; html: string; text: string } {
  const previousLabel = STATUS_LABELS[previousStatus] ?? previousStatus;
  const newLabel = STATUS_LABELS[newStatus] ?? newStatus;
  const explanation = explanationFor(newStatus, transitionType);
  const emailSubject = `Update on ${ticketNumber} — ${newLabel}`;

  const text = `Hello,

There's an update on your support request.

Ticket: ${ticketNumber} — ${subject}
Status: ${previousLabel} → ${newLabel}

${explanation}
${latestPublicReply ? `\nLatest reply from our team:\n${latestPublicReply}\n` : ""}
Track your request:
${trackingUrl}

Thank you for contacting ${organizationName}.

Regards,
${organizationName} Support Team`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hello,</p>
      <p>There's an update on your support request.</p>
      <p>
        <strong>Ticket:</strong> ${escapeHtml(ticketNumber)} — ${escapeHtml(subject)}<br />
        <strong>Status:</strong> ${escapeHtml(previousLabel)} &rarr; ${escapeHtml(newLabel)}
      </p>
      <p>${escapeHtml(explanation)}</p>
      ${
        latestPublicReply
          ? `<blockquote style="border-left:3px solid #e5e7eb;margin:16px 0;padding-left:12px;color:#374151;">${escapeHtml(latestPublicReply)}</blockquote>`
          : ""
      }
      <p style="margin: 24px 0;">
        <a href="${trackingUrl}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Track your request</a>
      </p>
      <p>Thank you for contacting ${escapeHtml(organizationName)}.</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">Regards,<br />${escapeHtml(organizationName)} Support Team</p>
    </div>
  `;

  return { subject: emailSubject, html, text };
}
