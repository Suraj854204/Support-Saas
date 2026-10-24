import { aiClient } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { assessSeverity, CONTACT_WINDOW_HOURS, type Severity } from "@/modules/escalations/severity";
import { isOriginAllowed } from "@/modules/forms/forms.service";

export const MIN_CONFIDENCE = 0.45;

export interface ChatTurn {
  role: "visitor" | "assistant";
  text: string;
}

export interface AssistantReply {
  reply: string;
  /** Show the "talk to our team" form. */
  handoff: boolean;
  /** Serious matter: the team is promised to reach out within contactWithinHours. */
  urgent: boolean;
  contactWithinHours: number | null;
  confidence: number;
  sources: string[];
}

const NOT_SURE =
  "I'm not fully sure about that one, and I don't want to guess. I can pass this to our team so a person helps you personally.";
const SERIOUS =
  "This sounds important, and a person should look at it, not a bot. I can ask our team to contact you by call or message within 24 hours. Please share your details below.";
const UNAVAILABLE = "Sorry, I can't answer right now. I can pass your message to our team instead.";

/**
 * Pure decision: what the visitor sees, and whether a human takes over.
 * - Critical matters (defect, safety, legal, fraud, very large sums) never get an AI answer: a person follows up.
 * - High matters get the answer if the knowledge base had one, plus the human follow-up offer.
 * - Anything the knowledge base cannot back up is not guessed: handed to the team.
 */
export function decideReply(input: {
  suggestedReply: string;
  confidence: number;
  sourceTitles: string[];
  severity: Severity;
}): AssistantReply {
  const { severity, confidence } = input;
  const sources = input.sourceTitles.slice(0, 3);
  const hasAnswer = confidence >= MIN_CONFIDENCE && sources.length > 0 && input.suggestedReply.trim().length > 0;
  const serious = severity.level !== "none";

  if (severity.level === "critical") {
    return { reply: SERIOUS, handoff: true, urgent: true, contactWithinHours: CONTACT_WINDOW_HOURS, confidence, sources: [] };
  }
  if (severity.level === "high") {
    const reply = hasAnswer ? `${input.suggestedReply.trim()}\n\n${SERIOUS}` : SERIOUS;
    return { reply, handoff: true, urgent: true, contactWithinHours: CONTACT_WINDOW_HOURS, confidence, sources: hasAnswer ? sources : [] };
  }
  if (hasAnswer) {
    return { reply: input.suggestedReply.trim(), handoff: false, urgent: false, contactWithinHours: null, confidence, sources };
  }
  return { reply: NOT_SURE, handoff: !serious, urgent: false, contactWithinHours: null, confidence, sources: [] };
}

async function resolveAssistant(publicKey: string, origin: string | undefined) {
  const form = await prisma.intakeForm.findUnique({ where: { publicKey } });
  // Unknown, paused and wrong-type keys look identical so keys can't be probed.
  if (!form || !form.isActive || form.source !== "assistant") throw AppError.notFound("This assistant is not available");
  if (!isOriginAllowed(form.allowedOrigins, origin)) throw AppError.forbidden("This site is not allowed to use this assistant");
  return form;
}

export const assistantService = {
  async config(publicKey: string, origin: string | undefined) {
    const form = await resolveAssistant(publicKey, origin);
    return { name: form.name };
  },

  async chat(publicKey: string, origin: string | undefined, input: { message: string; history: ChatTurn[] }): Promise<AssistantReply> {
    const form = await resolveAssistant(publicKey, origin);

    const history = input.history.slice(-8);
    const visitorText = [...history.filter((t) => t.role === "visitor").map((t) => t.text), input.message].join("\n");
    const severity = assessSeverity(visitorText);

    // Critical matters skip the AI entirely: faster, and no risk of a wrong answer on a safety issue.
    if (severity.level === "critical") {
      return decideReply({ suggestedReply: "", confidence: 0, sourceTitles: [], severity });
    }

    try {
      const result = await aiClient.suggestReplyUntraced({
        orgId: form.orgId,
        ticketId: `assistant:${form.id}`,
        messages: [
          ...history.map((t) => ({ author_type: t.role === "visitor" ? ("customer" as const) : ("ai" as const), body: t.text })),
          { author_type: "customer" as const, body: input.message },
        ],
      });
      return decideReply({
        suggestedReply: result.suggested_reply,
        confidence: result.confidence,
        sourceTitles: result.source_articles.map((a) => a.title),
        severity,
      });
    } catch (err) {
      logger.warn({ err, formId: form.id }, "Assistant AI call failed; handing over to the team");
      return { reply: UNAVAILABLE, handoff: true, urgent: severity.level !== "none", contactWithinHours: severity.level !== "none" ? CONTACT_WINDOW_HOURS : null, confidence: 0, sources: [] };
    }
  },
};
