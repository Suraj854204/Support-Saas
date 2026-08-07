import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/config/env";
import { logger } from "@/lib/logger";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** RFC 2822 headers for email threading (In-Reply-To/References) — used by Feature 8. */
  headers?: Record<string, string>;
  /** Override the From address, e.g. an organization's connected support inbox. */
  from?: string;
}

export interface SendMailResult {
  delivered: boolean;
  messageId?: string;
  error?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_USER || !env.SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Sends an email. Never throws — a failed/unsent notification should not
 * abort the caller's business transaction (e.g. ticket creation). Callers
 * that need to track delivery should persist SendMailResult themselves.
 *
 * IMPORTANT: never log `html`/`text` bodies or recipient PII beyond the
 * destination address's domain-safe form — email bodies may contain
 * customer-sensitive content, OTPs, or reset/verification tokens.
 */
export const mailService = {
  async send(input: SendMailInput): Promise<SendMailResult> {
    const client = getTransporter();

    if (!client) {
      if (env.MAIL_DEV_LOG_ONLY) {
        logger.info({ to: input.to, subject: input.subject }, "MAIL_DEV_LOG_ONLY: mail not sent (no SMTP creds configured)");
        return { delivered: false, error: "SMTP not configured (dev log-only mode)" };
      }
      logger.error("Mail send attempted with no SMTP transporter configured");
      return { delivered: false, error: "SMTP not configured" };
    }

    try {
      const info = await client.sendMail({
        from: input.from ?? env.MAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
      });
      return { delivered: true, messageId: info.messageId };
    } catch (err) {
      logger.error({ err, subject: input.subject }, "Failed to send email");
      return { delivered: false, error: err instanceof Error ? err.message : "Unknown mail error" };
    }
  },
};
