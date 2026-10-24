import type { Prisma } from "@prisma/client";

import type { CreateMacroInput, UpdateMacroInput } from "./macros.schema";

import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ticketsService } from "@/modules/tickets/tickets.service";

type Status = "open" | "pending" | "on_hold" | "solved" | "closed";
type Priority = "low" | "normal" | "high" | "urgent";

export interface MacroPlan {
  reply: string | null;
  update: { status?: Status; priority?: Priority; tags?: string[] };
}

/** Pure: what applying a macro to a ticket would change. Tags are merged, never replaced. */
export function planMacro(
  macro: { replyBody: string | null; setStatus: string | null; setPriority: string | null; addTags: string[] },
  ticket: { tags: string[] }
): MacroPlan {
  const update: MacroPlan["update"] = {};
  if (macro.setStatus) update.status = macro.setStatus as Status;
  if (macro.setPriority) update.priority = macro.setPriority as Priority;
  const merged = [...new Set([...ticket.tags, ...macro.addTags])];
  if (merged.length !== ticket.tags.length) update.tags = merged;
  return { reply: macro.replyBody, update };
}

/** Pure: fill {{customer_name}} / {{agent_name}} so replies read personally. */
export function renderMacroReply(body: string, vars: { customerName: string | null; agentName: string }): string {
  const first = (vars.customerName ?? "").trim().split(/\s+/)[0] || "there";
  return body.replace(/{{\s*customer_name\s*}}/g, first).replace(/{{\s*agent_name\s*}}/g, vars.agentName);
}

export const macrosService = {
  list(orgId: string) {
    return prisma.macro.findMany({ where: { orgId }, orderBy: { name: "asc" } });
  },

  async create(orgId: string, userId: string, input: CreateMacroInput) {
    const macro = await prisma.macro.create({
      data: {
        orgId,
        createdById: userId,
        name: input.name,
        replyBody: input.replyBody ?? null,
        setStatus: input.setStatus ?? null,
        setPriority: input.setPriority ?? null,
        addTags: input.addTags,
      },
    });
    await recordAudit({ orgId, actorId: userId, action: "macro.created", targetType: "macro", targetId: macro.id });
    return macro;
  },

  async update(orgId: string, id: string, userId: string, input: UpdateMacroInput) {
    const existing = await prisma.macro.findFirst({ where: { id, orgId } });
    if (!existing) throw AppError.notFound("Macro not found");
    const data: Prisma.MacroUpdateInput = { ...input };
    const next = { ...existing, ...input };
    if (!next.replyBody && !next.setStatus && !next.setPriority && next.addTags.length === 0) {
      throw AppError.validation("A macro must do at least one thing");
    }
    const macro = await prisma.macro.update({ where: { id }, data });
    await recordAudit({ orgId, actorId: userId, action: "macro.updated", targetType: "macro", targetId: id });
    return macro;
  },

  async remove(orgId: string, id: string, userId: string) {
    const { count } = await prisma.macro.deleteMany({ where: { id, orgId } });
    if (count === 0) throw AppError.notFound("Macro not found");
    await recordAudit({ orgId, actorId: userId, action: "macro.deleted", targetType: "macro", targetId: id });
  },

  /** Runs through the normal ticket service so SLA, emails, webhooks and automations behave exactly as for a manual action. */
  async apply(orgId: string, macroId: string, ticketId: string, actor: { userId: string; name: string }) {
    const macro = await prisma.macro.findFirst({ where: { id: macroId, orgId } });
    if (!macro) throw AppError.notFound("Macro not found");
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, orgId },
      include: { customer: { select: { name: true } } },
    });
    if (!ticket) throw AppError.notFound("Ticket not found");

    const plan = planMacro(macro, ticket);
    let replied = false;
    if (plan.reply) {
      const body = renderMacroReply(plan.reply, { customerName: ticket.customer?.name ?? null, agentName: actor.name });
      await ticketsService.addMessage(orgId, ticketId, actor.userId, { body, bodyFormat: "text", isInternalNote: false });
      replied = true;
    }
    if (Object.keys(plan.update).length > 0) {
      await ticketsService.update(orgId, ticketId, plan.update, actor.userId);
    }
    await recordAudit({
      orgId,
      actorId: actor.userId,
      action: "macro.applied",
      targetType: "ticket",
      targetId: ticketId,
      metadata: { macroId, replied, changed: Object.keys(plan.update) },
    });
    return { replied, changed: Object.keys(plan.update) };
  },
};
