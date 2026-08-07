import type { AutomationTrigger, Ticket } from "@prisma/client";

import { isWithinBusinessHours } from "@/lib/business-hours";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { cannedResponsesService } from "@/modules/canned-responses/canned-responses.service";
import { gmailSendService } from "@/modules/email-integrations/gmail-send.service";
import { buildReplySubject } from "@/modules/email-integrations/gmail-thread.service";
import { resolveBusinessHours } from "@/modules/sla/sla-policy";

interface Condition {
  field: "subject" | "message_text" | "customer_tags" | "channel" | "priority" | "status" | "team" | "business_hours";
  operator: "contains" | "equals" | "not_equals" | "in";
  value: string;
}

interface Action {
  type: "set_priority" | "assign_team" | "add_tag" | "send_email";
  value: string;
}

interface EvalContext {
  ticket: Ticket;
  messageText?: string;
  customerTags?: string[];
  isBusinessHours?: boolean;
}

function applyOperator(actual: string | string[], operator: Condition["operator"], expected: string): boolean {
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
    default:
      return false;
  }
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

export const automationEngine = {
  async run(orgId: string, trigger: AutomationTrigger, ticket: Ticket, context: { messageText?: string } = {}) {
    const rules = await prisma.automationRule.findMany({
      where: { orgId, trigger, isActive: true },
      orderBy: { position: "asc" },
    });
    if (rules.length === 0) return;

    const allConditions = rules.flatMap((r) => r.conditions as unknown as Condition[]);

    let customerTags: string[] | undefined;
    if (allConditions.some((c) => c.field === "customer_tags")) {
      const customer = await prisma.customer.findUnique({ where: { id: ticket.customerId }, select: { tags: true } });
      customerTags = customer?.tags;
    }

    let isBusinessHours: boolean | undefined;
    if (allConditions.some((c) => c.field === "business_hours")) {
      const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { businessHours: true } });
      const bh = resolveBusinessHours(org?.businessHours);
      isBusinessHours = bh ? isWithinBusinessHours(new Date(), bh) : false;
    }

    const ctx: EvalContext = { ticket, messageText: context.messageText, customerTags, isBusinessHours };

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as Condition[];
      const matches = conditions.every((c) => evaluateCondition(c, ctx));
      if (!matches) continue;

      const actions = rule.actions as unknown as Action[];
      const applied = await applyActions(orgId, ticket, actions);

      await prisma.automationRunLog.create({
        data: { orgId, ruleId: rule.id, ticketId: ticket.id, actionsApplied: applied },
      });
    }
  },
};
