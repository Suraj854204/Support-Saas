import { Prisma } from "@prisma/client";

import { aiClient } from "@/lib/ai-client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { decideReply, type AssistantReply } from "@/modules/assistant/assistant.service";
import { entitlementsService } from "@/modules/billing/entitlements.service";
import { escalationsService } from "@/modules/escalations/escalations.service";
import { assessSeverity, CONTACT_WINDOW_HOURS } from "@/modules/escalations/severity";
import { slaService } from "@/modules/sla/sla.service";
import { ticketsService } from "@/modules/tickets/tickets.service";
import { emitToOrg, emitToTicketWidgetRoom } from "@/sockets";

export const HANDOFF_TAG = "human-handoff";
export const AI_REPLY_MODES = ["off", "copilot", "autopilot"] as const;
export type AiReplyMode = (typeof AI_REPLY_MODES)[number];

/** Hard stops so the AI can never loop or flood a conversation. */
const MAX_AI_REPLIES_PER_10_MIN = 6;
const MAX_UNSUCCESSFUL_BEFORE_HANDOFF = 2;

export type Intent =
  | "human_request"
  | "refund"
  | "payment_dispute"
  | "account_security"
  | "order_status"
  | "complaint"
  | "general";

/** Cheap, explainable intent detection (English + Hinglish). Stored with the reply so agents can see it. */
const INTENT_RULES: { intent: Intent; test: RegExp }[] = [
  { intent: "human_request", test: /\b(human|real person|live agent|agent please|talk to (a |an )?(person|agent|someone|representative)|speak (to|with) (a |an )?(person|agent|representative)|insaan|kisi se baat)\b/i },
  { intent: "payment_dispute", test: /\b(chargeback|charged (me )?(twice|two times|double)|double charge[d]?|duplicate (charge|payment)|unauthori[sz]ed (charge|payment|transaction)|paisa (kat|cut) gaya)\b/i },
  { intent: "account_security", test: /\b(hacked|account (was )?(compromised|stolen)|someone (else )?(logged|accessed)|unauthori[sz]ed (login|access)|change (my )?(email|phone|password) for me|2fa|two[- ]factor|account delete|delete my account)\b/i },
  { intent: "refund", test: /\b(refund|money back|reimburse|paisa wapas|paise wapas)\b/i },
  { intent: "order_status", test: /\b(where is my order|order status|track(ing)? (my )?(order|package|parcel)|delivery status|mera order)\b/i },
  { intent: "complaint", test: /\b(complaint|unacceptable|worst|terrible|disappointed|shikayat|escalate)\b/i },
];

export function detectIntent(text: string): Intent {
  for (const rule of INTENT_RULES) if (rule.test.test(text)) return rule.intent;
  return "general";
}

/**
 * Intents the AI must never resolve by itself: they need a person's judgement, private account data,
 * or an action in an external system (refunds, order lookups, account changes). The AI never claims
 * it did any of these.
 */
const HUMAN_ONLY: ReadonlySet<Intent> = new Set(["human_request", "refund", "payment_dispute", "account_security", "order_status", "complaint"]);

const HUMAN_REPLY: Record<string, string> = {
  human_request: "Of course. I've asked our team to take over this conversation. A person will reply here as soon as they can.",
  refund: "Refunds are handled by our team. I've passed your request on, and a person will review it and reply here. I can't confirm a refund myself.",
  payment_dispute: "Payment issues need a person to look at your account. I've passed this to our team, and they will reply here. I can't change or reverse any payment myself.",
  account_security: "For your safety, account and security changes are handled by our team only. I've passed this on, and a person will reply here.",
  order_status: "I can't look up orders from this chat. I've asked our team to check and reply here with the real status.",
  complaint: "I'm sorry about this experience. I've asked our team to look into it personally, and they will reply here.",
};

export interface AiReplyOutcome {
  outcome: "skipped" | "duplicate" | "replied" | "handoff";
  reason?: string;
  messageId?: string;
}

/** Customer-safe shape: never expose internal notes, AI meta, or staff user ids. */
export const CUSTOMER_MESSAGE_SELECT = {
  id: true,
  ticketId: true,
  authorType: true,
  body: true,
  aiGenerated: true,
  deliveryStatus: true,
  createdAt: true,
} satisfies Prisma.TicketMessageSelect;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function markHandoff(orgId: string, ticketId: string, reason: string, tags: string[]) {
  if (tags.includes(HANDOFF_TAG)) return;
  await ticketsService.update(orgId, ticketId, { tags: [...tags, HANDOFF_TAG] });
  await prisma.ticketMessage.create({
    data: { ticketId, authorType: "system", body: `Handed to a human. Reason: ${reason}`, isInternalNote: true },
  });
}

export const aiReplyService = {
  /**
   * Runs after a customer message is stored. Safe to call twice for the same message:
   * the AI reply is keyed `ai:<customerMessageId>` (unique per ticket), so a retry can never
   * produce a second reply. Never throws; any failure becomes a human handoff.
   */
  async handleCustomerMessage(params: { orgId: string; ticketId: string; customerMessageId: string }): Promise<AiReplyOutcome> {
    const { orgId, ticketId, customerMessageId } = params;
    try {
      return await this.run(orgId, ticketId, customerMessageId);
    } catch (err) {
      logger.error({ err, ticketId }, "AI reply pipeline failed");
      return { outcome: "skipped", reason: "error" };
    }
  },

  async run(orgId: string, ticketId: string, customerMessageId: string): Promise<AiReplyOutcome> {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { aiReplyMode: true } });
    const mode = (org?.aiReplyMode ?? "copilot") as AiReplyMode;

    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId }, select: { id: true, tags: true, status: true } });
    if (!ticket) return { outcome: "skipped", reason: "ticket_not_found" };

    const messages = await prisma.ticketMessage.findMany({
      where: { ticketId, isInternalNote: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, authorType: true, body: true, aiMeta: true, createdAt: true },
    });
    const customerText = messages.filter((m) => m.authorType === "customer").slice(-6).map((m) => m.body).join("\n");
    const latest = messages.find((m) => m.id === customerMessageId);
    if (!latest) return { outcome: "skipped", reason: "message_not_found" };

    // Serious matters are escalated whatever the AI mode is: the 24-hour contact clock always starts.
    const severity = assessSeverity(customerText);
    await escalationsService.evaluate({ orgId, ticketId, text: customerText, severity });

    if (mode !== "autopilot") return { outcome: "skipped", reason: `mode_${mode}` };
    if (ticket.tags.includes(HANDOFF_TAG)) return { outcome: "skipped", reason: "human_has_taken_over" };
    if (messages.some((m) => m.authorType === "agent")) return { outcome: "skipped", reason: "agent_replied" };
    if (["solved", "closed"].includes(ticket.status)) return { outcome: "skipped", reason: "ticket_closed" };

    const tenMinAgo = Date.now() - 10 * 60_000;
    const recentAi = messages.filter((m) => m.authorType === "ai" && m.createdAt.getTime() > tenMinAgo).length;
    if (recentAi >= MAX_AI_REPLIES_PER_10_MIN) return { outcome: "skipped", reason: "rate_guard" };

    const unsuccessful = messages.filter((m) => {
      const meta = m.aiMeta as { decision?: string } | null;
      return m.authorType === "ai" && meta?.decision && meta.decision !== "answered";
    }).length;

    const intent = detectIntent(latest.body);
    let reply: AssistantReply;
    let decision: "answered" | "handoff_plan_limit" | "handoff_intent" | "handoff_low_confidence" | "handoff_critical" | "handoff_repeat" | "handoff_ai_unavailable";
    let sources: { id: string; title: string }[] = [];
    let confidence = 0;

    if (HUMAN_ONLY.has(intent)) {
      reply = {
        reply: HUMAN_REPLY[intent]!,
        handoff: true,
        urgent: severity.level !== "none",
        contactWithinHours: severity.level !== "none" ? CONTACT_WINDOW_HOURS : null,
        confidence: 0,
        sources: [],
      };
      decision = "handoff_intent";
    } else if (severity.level === "critical") {
      reply = decideReply({ suggestedReply: "", confidence: 0, sourceTitles: [], severity });
      decision = "handoff_critical";
    } else if (!(await entitlementsService.consumeAiReply(orgId))) {
      // The month's AI allowance is used up: nothing is guessed, a person takes over. The visitor is not told about plans.
      reply = {
        reply: "I can't answer automatically right now. I've passed your message to our team and a person will reply here.",
        handoff: true,
        urgent: severity.level !== "none",
        contactWithinHours: severity.level !== "none" ? CONTACT_WINDOW_HOURS : null,
        confidence: 0,
        sources: [],
      };
      decision = "handoff_plan_limit";
    } else {
      try {
        const result = await aiClient.suggestReply({
          orgId,
          ticketId,
          messages: messages.map((m) => ({ author_type: m.authorType as "customer" | "agent" | "ai" | "system", body: m.body })),
        });
        reply = decideReply({
          suggestedReply: result.suggested_reply,
          confidence: result.confidence,
          sourceTitles: result.source_articles.map((a) => a.title),
          severity,
        });
        confidence = result.confidence;
        sources = result.source_articles.slice(0, 3).map((a) => ({ id: a.article_id, title: a.title }));
        decision = reply.handoff ? "handoff_low_confidence" : "answered";
      } catch (err) {
        logger.warn({ err, ticketId }, "AI service unavailable; handing the conversation to a human");
        reply = {
          reply: "Sorry, I can't answer right now. I've passed your message to our team and a person will reply here.",
          handoff: true,
          urgent: severity.level !== "none",
          contactWithinHours: severity.level !== "none" ? CONTACT_WINDOW_HOURS : null,
          confidence: 0,
          sources: [],
        };
        decision = "handoff_ai_unavailable";
      }
      // Repeated unsuccessful attempts: stop guessing, bring in a person.
      if (decision !== "answered" && unsuccessful + 1 >= MAX_UNSUCCESSFUL_BEFORE_HANDOFF) {
        reply = { ...reply, handoff: true };
        decision = decision === "handoff_ai_unavailable" ? decision : "handoff_repeat";
      }
    }

    // Persist first (idempotent), deliver second. The unique (ticketId, clientMessageId) key makes a retry a no-op.
    let message;
    try {
      message = await prisma.ticketMessage.create({
        data: {
          ticketId,
          authorType: "ai",
          authorId: null,
          body: reply.reply,
          aiGenerated: true,
          clientMessageId: `ai:${customerMessageId}`,
          deliveryStatus: "pending",
          aiMeta: { intent, decision, confidence, sources, severity: severity.level, reasons: severity.reasons } as Prisma.InputJsonValue,
        },
        select: { ...CUSTOMER_MESSAGE_SELECT, aiMeta: true },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { outcome: "duplicate" };
      throw err;
    }

    if (reply.handoff) {
      await markHandoff(orgId, ticketId, decision.replace(/^handoff_/, "").replace(/_/g, " "), ticket.tags);
      if (severity.level === "none") {
        await prisma.ticketMessage.create({
          data: {
            ticketId,
            authorType: "system",
            body: `AI handoff. Intent: ${intent}. Confidence: ${confidence.toFixed(2)}.`,
            isInternalNote: true,
          },
        });
      }
    } else {
      void slaService.markFirstResponse(ticketId);
    }

    // Delivery on the widget channel = stored + pushed to the visitor's room; the widget also polls, so a
    // missed push never loses the message.
    try {
      const customerView = {
        id: message.id,
        ticketId: message.ticketId,
        authorType: message.authorType,
        body: message.body,
        aiGenerated: message.aiGenerated,
        deliveryStatus: message.deliveryStatus,
        createdAt: message.createdAt,
      };
      emitToTicketWidgetRoom(ticketId, "ticket:message", customerView);
      emitToOrg(orgId, "ticket:message", { ...customerView, aiMeta: message.aiMeta });
      await prisma.ticketMessage.update({ where: { id: message.id }, data: { deliveryStatus: "delivered" } });
    } catch (err) {
      logger.error({ err, messageId: message.id }, "AI reply stored but live delivery failed; visitor will receive it on next poll");
      await prisma.ticketMessage.update({ where: { id: message.id }, data: { deliveryStatus: "failed" } }).catch(() => undefined);
    }

    return { outcome: reply.handoff ? "handoff" : "replied", messageId: message.id };
  },

  /** The visitor pressed "Talk to a human". Idempotent: pressing twice stores one request. */
  async requestHuman(orgId: string, customerId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId, customerId }, select: { id: true, tags: true } });
    if (!ticket) return null;
    if (ticket.tags.includes(HANDOFF_TAG)) return { alreadyRequested: true };

    try {
      const msg = await prisma.ticketMessage.create({
        data: {
          ticketId,
          authorType: "system",
          body: "You asked for a person. Our team has been notified and will reply here.",
          clientMessageId: "human-request",
          deliveryStatus: "delivered",
        },
        select: CUSTOMER_MESSAGE_SELECT,
      });
      await markHandoff(orgId, ticketId, "customer asked for a human", ticket.tags);
      emitToTicketWidgetRoom(ticketId, "ticket:message", msg);
      emitToOrg(orgId, "ticket:message", msg);
      return { alreadyRequested: false };
    } catch (err) {
      if (isUniqueViolation(err)) return { alreadyRequested: true };
      throw err;
    }
  },
};
