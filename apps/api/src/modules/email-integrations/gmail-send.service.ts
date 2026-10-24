import type { EmailConnection } from "@prisma/client";
import { google } from "googleapis";
import { v4 as uuid } from "uuid";

import { ensureFreshAccessToken } from "./email-integration.service";

import { logger } from "@/lib/logger";

// Our own Message-IDs embed the ticket UUID directly, so a customer's reply
// (which echoes it back in In-Reply-To/References) reveals the ticket
// without needing a lookup table — see gmail-thread.service.ts priority 2.
const MESSAGE_ID_DOMAIN = "supportflow.internal";

export interface SendGmailReplyInput {
  connection: EmailConnection;
  ticketId: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  /** Set when this reply continues an existing Gmail thread. */
  threadId?: string | null;
  /** The Message-ID this reply is answering, for In-Reply-To/References. */
  inReplyTo?: string | null;
  /** Plus-address local-part tag (Feature 8's reply-token fallback), e.g. "a1b2c3d4e5". */
  replyToken?: string | null;
  /**
   * Marks this as an automated message (acknowledgements, status updates —
   * never agent replies) so the customer's own autoresponder/out-of-office
   * doesn't bounce back and forth with ours. See Feature 8 "prevent email
   * loops" / "auto-response suppression headers."
   */
  isAutomated?: boolean;
}

export interface SendGmailReplyResult {
  delivered: boolean;
  gmailMessageId?: string;
  gmailThreadId?: string;
  messageId: string;
  error?: string;
}

function buildAuthedClient(accessToken: string) {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return client;
}

function plusAddress(email: string, tag: string): string | null {
  const [local, domain] = email.split("@");
  if (!local || !domain) return null;
  return `${local}+${tag}@${domain}`;
}

function encodeHeaderValue(value: string): string {
  // Minimal RFC 2047 encoding for non-ASCII subjects/names — most ticket
  // subjects are plain ASCII, but customer-supplied text isn't guaranteed to be.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawMessage(input: SendGmailReplyInput & { fromEmail: string; fromName: string }): {
  raw: string;
  messageId: string;
} {
  const messageId = `<ticket-${input.ticketId}-${uuid()}@${MESSAGE_ID_DOMAIN}>`;
  const boundary = `----supportflow-${uuid()}`;
  const replyTo = input.replyToken ? plusAddress(input.fromEmail, input.replyToken) : null;

  const headers: string[] = [
    `From: ${encodeHeaderValue(input.fromName)} <${input.fromEmail}>`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];

  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
    headers.push(`References: ${input.inReplyTo}`);
  }
  if (input.isAutomated) {
    // Standard signals that tell the recipient's mail system (and any of
    // its own autoresponders) this message shouldn't trigger an automatic
    // reply back — the core anti-loop mechanism for our own automated sends.
    headers.push("Auto-Submitted: auto-replied");
    headers.push("X-Auto-Response-Suppress: All");
  }

  let body: string;
  if (input.htmlBody) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      input.textBody,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      input.htmlBody,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    headers.push("Content-Type: text/plain; charset=UTF-8");
    headers.push("Content-Transfer-Encoding: 7bit");
    body = input.textBody;
  }

  const raw = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return { raw: Buffer.from(raw, "utf8").toString("base64url"), messageId };
}

export const gmailSendService = {
  async sendReply(input: SendGmailReplyInput): Promise<SendGmailReplyResult> {
    const { raw, messageId } = buildRawMessage({
      ...input,
      fromEmail: input.connection.email,
      fromName: "Support",
    });

    try {
      const { accessToken } = await ensureFreshAccessToken(input.connection);
      const gmail = google.gmail({ version: "v1", auth: buildAuthedClient(accessToken) });

      const { data } = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          threadId: input.threadId ?? undefined,
        },
      });

      return {
        delivered: true,
        gmailMessageId: data.id ?? undefined,
        gmailThreadId: data.threadId ?? undefined,
        messageId,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown Gmail send error";
      logger.error({ err, ticketId: input.ticketId }, "Failed to send email via Gmail API");
      return { delivered: false, messageId, error };
    }
  },
};
