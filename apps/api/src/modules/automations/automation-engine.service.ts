import type { AutomationTrigger, Ticket } from "@prisma/client";
import { v4 as uuid } from "uuid";

import { isWithinBusinessHours } from "@/lib/business-hours";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { cannedResponsesService } from "@/modules/canned-responses/canned-responses.service";
import { gmailSendService } from "@/modules/email-integrations/gmail-send.service";
import { buildReplySubject } from "@/modules/email-integrations/gmail-thread.service";
import { resolveBusinessHours } from "@/modules/sla/sla-policy";

export interface Condition {
  field:
    | "subject"
    | "message_text"
    | "customer_tags"
    | "channel"
    | "priority"
    | "status"
    | "team"
    | "business_hours"
    // Added later; older stored rules never use these.
    | "customer_vip"
    | "customer_email_domain"
    | "ticket_age_hours"
    | "sentiment"
    | "assignee";
  operator: "contains" | "equals" | "not_equals" | "in" | "not_contains" | "gt" | "lt";
  value: string;
}

export interface Action {
  type:
    | "set_priority"
    | "assign_team"
    | "add_tag"
    | "send_email"
    // Added later.
    | "assign_agent"
    | "set_status"
    | "add_internal_note"
    | "remove_tag"
    | "stop_processing";
  value: string;
}

interface EvalContext {
  ticket: Ticket;
  messageText?: string;
  customerTags?: string[];
  customerIsVip?: boolean;
  customerEmail?: string | null;
  isBusinessHours?: boolean;
  now?: Date;
}

const OPEN_STATUSES = ["open", "pending", "on_hold"] as const;
const VALID_STATUSES = ["open", "pending", "on_hold", "solved", "closed"];
export const LEAST_LOADED = "least_loaded";

function applyOperator(actual: string | string[], operator: Condition["operator"], expected: string): boolean {
  if (operator === "gt" || operator === "lt") {
    const a = Number(Array.isArray(actual) ? actual.length : actual);
    const e = Number(expected);
    if (Number.isNaN(a) || Number.isNaN(e)) return false;
    return operator === "gt" ? a > e : a < e;
  }
  if (operator === "not_contains") {
    const haystack = Array.isArray(actual) ? actual.join("\n") : actual;
    return !haystack.toLowerCase().includes(expected.toLowerCase());
  }

  if (Array.isArray(actual)) {
    const normalized = actual.map((v) => v.toLowerCase());
    if (operator === "contains" || operator === "in" || operator === "equals") {
      return normalized.includes(expected.toLowerCase());
    }
    return operator === "not_equals" ? !normalized.includes(expected.toLowerCase()) : false;
  }

  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  switch (operator) {
    case "contains":
      return a.includes(e);
    case "equals":
      return a === e;
    case "not_equals":
      return a !== e;
    case "in":
      return e.split(",").map((s) => s.trim()).includes(a);
    default:
      return false;
  }
}

function evaluateCondition(condition: Condition, ctx: EvalContext): boolean {
  switch (condition.field) {
    case "subject":
      return applyOperator(ctx.ticket.subject, condition.operator, condition.value);
    case "message_text":
      return applyOperator(ctx.messageText ?? "", condition.operator, condition.value);
    case "customer_tags":
      return applyOperator(ctx.customerTags ?? [], condition.operator, condition.value);
    case "channel":
      return applyOperator(ctx.ticket.channel, condition.operator, condition.value);
    case "priority":
      return applyOperator(ctx.ticket.priority, condition.operator, condition.value);
    case "status":
      return applyOperator(ctx.ticket.status, condition.operator, condition.value);
    case "team":
      return applyOperator(ctx.ticket.teamId ?? "", condition.operator, condition.value);
    case "business_hours":
      return String(ctx.isBusinessHours ?? false) === condition.value.toLowerCase();
    case "customer_vip":
      return String(ctx.customerIsVip ?? false) === condition.value.toLowerCase();
    case "customer_email_domain": {
      const domain = ctx.customerEmail?.split("@")[1] ?? "";
      return applyOperator(domain, condition.operator, condition.value.replace(/^@/, ""));
    }
    case "ticket_age_hours": {
      const ageHours = ((ctx.now ?? new Date()).getTime() - ctx.ticket.createdAt.getTime()) / 3_600_000;
      return applyOperator(String(ageHours), condition.operator, condition.value);
    }
    case "sentiment":
      return applyOperator(ctx.ticket.aiSentiment ?? "", condition.operator, condition.value);
    case "assignee": {
      // "unassigned" / "assigned" — readable in rules without needing user ids.
      const state = ctx.ticket.assigneeId ? "assigned" : "unassigned";
      return applyOperator(state, condition.operator, condition.value);
    }
    default:
      return false;
  }
}

/** Per-condition results, so the UI can show *why* a rule did or didn't match. */
export function explainConditions(conditions: Condition[], ctx: EvalContext) {
  return conditions.map((c) => ({ ...c, matched: evaluateCondition(c, ctx) }));
}

async function pickLeastLoadedAgent(orgId: string, teamId: string | null): Promise<string | null> {
  let candidateIds: string[] | undefined;
  if (teamId) {
    const members = await prisma.teamMember.findMany({ where: { teamId }, select: { userId: true } });
    if (members.length > 0) candidateIds = members.map((m) => m.userId);
  }

  const agents = await prisma.user.findMany({
    where: { orgId, isActive: true, role: { in: ["agent", "admin"] }, ...(candidateIds && { id: { in: candidateIds } }) },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (agents.length === 0) return null;

  const loads = await prisma.ticket.groupBy({
    by: ["assigneeId"],
    where: { orgId, assigneeId: { in: agents.map((a) => a.id) }, status: { in: [...OPEN_STATUSES] } },
    _count: { _all: true },
  });
  const load = new Map(loads.map((l) => [l.assigneeId, l._count._all]));

  let best = agents[0]!.id;
  for (const a of agents) if ((load.get(a.id) ?? 0) < (load.get(best) ?? 0)) best = a.id;
  return best;
}

async function applyActions(
  orgId: string,
  ticket: Ticket,
  actions: Action[]
): Promise<Record<string, unknown>> {
  const applied: Record<string, unknown> = {};

  for (const action of actions) {
    try {
      switch (action.type) {
        case "set_priority": {
          if (!["low", "normal", "high", "urgent"].includes(action.value)) break;
          await prisma.ticket.update({ where: { id: ticket.id }, data: { priority: action.value as never } });
          applied.priority = action.value;
          break;
        }
        case "assign_team": {
          const team = await prisma.team.findFirst({ where: { id: action.value, orgId } });
          if (!team) {
            applied.assignTeamError = "Team not found";
            break;
          }
          await prisma.ticket.update({ where: { id: ticket.id }, data: { teamId: team.id } });
          applied.teamId = team.id;
          break;
        }
        case "add_tag": {
          const current = await prisma.ticket.findUnique({ where: { id: ticket.id }, select: { tags: true } });
          if (current && !current.tags.includes(action.value)) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: { tags: [...current.tags, action.value] },
            });
          }
          applied.tagAdded = action.value;
          break;
        }
        case "assign_agent": {
          const assigneeId =
            action.value === LEAST_LOADED
              ? await pickLeastLoadedAgent(orgId, ticket.teamId)
              : (await prisma.user.findFirst({ where: { id: action.value, orgId, isActive: true }, select: { id: true } }))?.id ?? null;
          if (!assigneeId) {
            applied.assignAgentError = "No eligible agent found";
            break;
          }
          if (assigneeId === ticket.assigneeId) {
            applied.assigneeId = assigneeId;
            break;
          }
          await prisma.ticket.update({ where: { id: ticket.id }, data: { assigneeId } });
          void publishEvent(KAFKA_TOPICS.TICKET_ASSIGNED, {
            eventId: uuid(),
            orgId,
            occurredAt: new Date().toISOString(),
            ticketId: ticket.id,
            assigneeId,
            previousAssigneeId: ticket.assigneeId,
          });
          applied.assigneeId = assigneeId;
          break;
        }
        case "set_status": {
          if (!VALID_STATUSES.includes(action.value)) break;
          const solved = action.value === "solved" || action.value === "closed";
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: action.value as never, ...(solved ? { resolvedAt: new Date() } : { resolvedAt: null }) },
          });
          applied.status = action.value;
          break;
        }
        case "add_internal_note": {
          await prisma.ticketMessage.create({
            data: { ticketId: ticket.id, authorType: "system", authorId: null, body: action.value, isInternalNote: true },
          });
          applied.noteAdded = true;
          break;
        }
        case "remove_tag": {
          const current = await prisma.ticket.findUnique({ where: { id: ticket.id }, select: { tags: true } });
          if (current?.tags.includes(action.value)) {
            await prisma.ticket.update({ where: { id: ticket.id }, data: { tags: current.tags.filter((t) => t !== action.value) } });
          }
          applied.tagRemoved = action.value;
          break;
        }
        case "stop_processing":
          applied.stoppedFurtherRules = true;
          break;
        case "send_email": {
          if (ticket.channel !== "email") {
            applied.sendEmailSkipped = "not an email-channel ticket";
            break;
          }
          const connection = await prisma.emailConnection.findFirst({ where: { orgId, isActive: true } });
          const customer = await prisma.customer.findUnique({ where: { id: ticket.customerId } });
          if (!connection || !customer?.email) {
            applied.sendEmailSkipped = "no active Gmail connection or customer has no email";
            break;
          }

          // action.value is either raw text, or "template:<cannedResponseId>"
          // referencing a saved canned response — resolved here so the
          // engine only ever deals with a plain string body either way.
          let body = action.value;
          if (action.value.startsWith("template:")) {
            const template = await cannedResponsesService.getById(orgId, action.value.slice("template:".length));
            if (!template) {
              applied.sendEmailSkipped = "referenced canned response not found";
              break;
            }
            body = template.body;
          }

          const result = await gmailSendService.sendReply({
            connection,
            ticketId: ticket.id,
            to: customer.email,
            subject: buildReplySubject(ticket.number, ticket.subject),
            textBody: body,
            threadId: ticket.gmailThreadId ?? undefined,
            isAutomated: true,
          });
          applied.emailSent = result.delivered;
          break;
        }
      }
    } catch (err) {
      logger.error({ err, action }, "Automation action failed");
      applied[`${action.type}Error`] = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return applied;
}

const CUSTOMER_FIELDS = new Set<Condition["field"]>(["customer_tags", "customer_vip", "customer_email_domain"]);

/** Loads only what the given conditions actually need, so rules without them stay as cheap as before. */
async function buildContext(
  orgId: string,
  ticket: Ticket,
  conditions: Condition[],
  messageText?: string
): Promise<EvalContext> {
  const ctx: EvalContext = { ticket, messageText, now: new Date() };

  if (conditions.some((c) => CUSTOMER_FIELDS.has(c.field))) {
    const customer = await prisma.customer.findUnique({
      where: { id: ticket.customerId },
      select: { tags: true, isVip: true, email: true },
    });
    ctx.customerTags = customer?.tags;
    ctx.customerIsVip = customer?.isVip ?? false;
    ctx.customerEmail = customer?.email ?? null;
  }

  if (conditions.some((c) => c.field === "business_hours")) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { businessHours: true } });
    const bh = resolveBusinessHours(org?.businessHours);
    ctx.isBusinessHours = bh ? isWithinBusinessHours(new Date(), bh) : false;
  }

  return ctx;
}

export const automationEngine = {
  async run(orgId: string, trigger: AutomationTrigger, ticket: Ticket, context: { messageText?: string } = {}) {
    const rules = await prisma.automationRule.findMany({
      where: { orgId, trigger, isActive: true },
      orderBy: { position: "asc" },
    });
    if (rules.length === 0) return;

    const allConditions = rules.flatMap((r) => r.conditions as unknown as Condition[]);
    const ctx = await buildContext(orgId, ticket, allConditions, context.messageText);

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as Condition[];
      const matches = conditions.every((c) => evaluateCondition(c, ctx));
      if (!matches) continue;

      const actions = rule.actions as unknown as Action[];
      const applied = await applyActions(orgId, ticket, actions);

      await prisma.automationRunLog.create({
        data: { orgId, ruleId: rule.id, ticketId: ticket.id, actionsApplied: applied as never },
      });

      // A rule can end the chain ("stop processing") so later, broader rules don't override it.
      if (actions.some((a) => a.type === "stop_processing")) break;
    }
  },

  /**
   * Dry run: evaluates a rule against a real ticket and reports which
   * conditions matched and what *would* happen. Changes nothing and sends nothing.
   */
  async simulate(orgId: string, ruleId: string, ticketId: string, messageText?: string) {
    const rule = await prisma.automationRule.findFirst({ where: { id: ruleId, orgId } });
    if (!rule) return null;
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId } });
    if (!ticket) return null;

    const conditions = rule.conditions as unknown as Condition[];
    const ctx = await buildContext(orgId, ticket, conditions, messageText);
    const results = explainConditions(conditions, ctx);
    const wouldMatch = results.every((r) => r.matched);

    return {
      wouldMatch,
      conditions: results,
      actions: wouldMatch ? (rule.actions as unknown as Action[]) : [],
    };
  },
};
