import type { ParsedEmailMessage } from "./gmail-message.parser";

import { prisma } from "@/lib/prisma";
import { generateReplyToken } from "@/lib/security";

/** `Re: [SUP-1042] Original subject` — used both to build outgoing subjects and to parse incoming ones. */
export function buildReplySubject(ticketNumber: number, subject: string): string {
  const tag = `[SUP-${ticketNumber}]`;
  if (subject.includes(tag)) return subject.startsWith("Re:") ? subject : `Re: ${subject}`;
  return `Re: ${tag} ${subject}`;
}

function extractTicketIdFromMessageIdHeaders(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/ticket-([0-9a-f-]{36})@/i);
  return match?.[1] ?? null;
}

function extractReplyTokenFromRecipient(recipientEmail: string | null): string | null {
  if (!recipientEmail) return null;
  const match = recipientEmail.match(/\+([a-f0-9]{6,20})@/i);
  return match?.[1] ?? null;
}

function extractTicketNumberFromSubject(subject: string | null): number | null {
  if (!subject) return null;
  const match = subject.match(/\[SUP-(\d+)\]/i);
  return match ? Number(match[1]) : null;
}

/**
 * Resolves an inbound message to an existing ticket, trying each signal in
 * the priority order Feature 8 specifies. Returns null (never throws) when
 * none match — the caller (email-ticket-ingestion.service.ts) treats that
 * as "this is a new conversation, create a ticket."
 */
export async function findExistingTicketForMessage(orgId: string, parsed: ParsedEmailMessage) {
  // 1. Stored Gmail thread ID — the strongest signal, since we always send
  // replies with the ticket's threadId set, so Gmail itself keeps every
  // message in the conversation under one thread.
  if (parsed.gmailThreadId) {
    const byThread = await prisma.ticket.findFirst({ where: { orgId, gmailThreadId: parsed.gmailThreadId } });
    if (byThread) return byThread;
  }

  // 2. In-Reply-To / References — our own Message-IDs embed the ticket's
  // UUID directly (see gmail-send.service.ts), so this is a direct lookup,
  // not a fuzzy match.
  const ticketIdFromHeaders =
    extractTicketIdFromMessageIdHeaders(parsed.inReplyTo) ?? extractTicketIdFromMessageIdHeaders(parsed.references);
  if (ticketIdFromHeaders) {
    const byMessageId = await prisma.ticket.findFirst({ where: { id: ticketIdFromHeaders, orgId } });
    if (byMessageId) return byMessageId;
  }

  // 3. Internal reply token, carried as a plus-address tag on the
  // recipient (e.g. support+a1b2c3d4e5@example.com) — survives even if a
  // mail gateway strips custom headers and rewrites Message-IDs.
  const replyToken = extractReplyTokenFromRecipient(parsed.recipientEmail);
  if (replyToken) {
    const byToken = await prisma.ticket.findFirst({ where: { orgId, emailReplyToken: replyToken } });
    if (byToken) return byToken;
  }

  // 4. Ticket reference in the subject line — last resort, since subjects
  // get mangled/translated/truncated by mail clients more than headers do.
  const ticketNumber = extractTicketNumberFromSubject(parsed.subject);
  if (ticketNumber !== null) {
    const bySubject = await prisma.ticket.findFirst({ where: { orgId, number: ticketNumber } });
    if (bySubject) return bySubject;
  }

  return null;
}

/** Ensures a ticket has a reply token, generating one on first use (existing email tickets predate this field). */
export async function ensureReplyToken(ticketId: string): Promise<string> {
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ticket.emailReplyToken) return ticket.emailReplyToken;

  const token = generateReplyToken();
  await prisma.ticket.update({ where: { id: ticketId }, data: { emailReplyToken: token } });
  return token;
}
