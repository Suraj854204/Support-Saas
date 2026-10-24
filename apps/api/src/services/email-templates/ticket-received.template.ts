import { escapeHtml } from "./shared";

export interface TicketReceivedTemplateInput {
  customerName: string;
  ticketNumber: string;
  trackingUrl: string;
  organizationName: string;
}

export function ticketReceivedTemplate({
  customerName,
  ticketNumber,
  trackingUrl,
  organizationName,
}: TicketReceivedTemplateInput): { subject: string; html: string; text: string } {
  const subject = `We've received your request — ${ticketNumber}`;

  const text = `Hello ${customerName},

Your support request has been received successfully and saved in our system.

Ticket ID: ${ticketNumber}
Current Status: Open

Our team will review your request and respond within 24 hours.

Track your request:
${trackingUrl}

For any additional information, reply directly to this email. Your reply will be added to the same support ticket.

Thank you for contacting ${organizationName}.

Have a great day.

Regards,
${organizationName} Support Team`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hello ${escapeHtml(customerName)},</p>
      <p>Your support request has been received successfully and saved in our system.</p>
      <p>
        <strong>Ticket ID:</strong> ${escapeHtml(ticketNumber)}<br />
        <strong>Current Status:</strong> Open
      </p>
      <p>Our team will review your request and respond within 24 hours.</p>
      <p style="margin: 24px 0;">
        <a href="${trackingUrl}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Track your request</a>
      </p>
      <p>For any additional information, reply directly to this email. Your reply will be added to the same support ticket.</p>
      <p>Thank you for contacting ${escapeHtml(organizationName)}.</p>
      <p>Have a great day.</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">Regards,<br />${escapeHtml(organizationName)} Support Team</p>
    </div>
  `;

  return { subject, html, text };
}
