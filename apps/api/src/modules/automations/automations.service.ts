import type { CreateAutomationRuleInput, UpdateAutomationRuleInput } from "./automations.schema";

import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

export const automationsService = {
  async list(orgId: string) {
    return prisma.automationRule.findMany({ where: { orgId }, orderBy: [{ trigger: "asc" }, { position: "asc" }] });
  },

  async create(orgId: string, createdById: string, input: CreateAutomationRuleInput) {
    return prisma.automationRule.create({
      data: {
        orgId,
        createdById,
        name: input.name,
        trigger: input.trigger,
        isActive: input.isActive,
        position: input.position,
        conditions: input.conditions,
        actions: input.actions,
        triggerConfig: input.triggerConfig,
      },
    });
  },

  async update(orgId: string, ruleId: string, input: UpdateAutomationRuleInput) {
    const existing = await prisma.automationRule.findFirst({ where: { id: ruleId, orgId } });
    if (!existing) throw AppError.notFound("Automation rule not found");
    return prisma.automationRule.update({ where: { id: ruleId }, data: input });
  },

  async remove(orgId: string, ruleId: string) {
    const existing = await prisma.automationRule.findFirst({ where: { id: ruleId, orgId } });
    if (!existing) throw AppError.notFound("Automation rule not found");
    await prisma.automationRule.delete({ where: { id: ruleId } });
  },

  async getRunLogs(orgId: string, ruleId: string) {
    const existing = await prisma.automationRule.findFirst({ where: { id: ruleId, orgId } });
    if (!existing) throw AppError.notFound("Automation rule not found");
    return prisma.automationRunLog.findMany({
      where: { ruleId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },
};
