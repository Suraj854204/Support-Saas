import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { automationEngine } from "@/modules/automations/automation-engine.service";
import { slaService } from "@/modules/sla/sla.service";

let intervalHandle: ReturnType<typeof setInterval> | undefined;
let running = false;

async function runTicketInactiveTriggers() {
  const rules = await prisma.automationRule.findMany({
    where: { trigger: "ticket_inactive", isActive: true },
  });

  for (const rule of rules) {
    const inactiveMinutes = Number((rule.triggerConfig as Record<string, unknown>).inactiveMinutes ?? 1440);
    const cutoff = new Date(Date.now() - inactiveMinutes * 60_000);

    const candidates = await prisma.ticket.findMany({
      where: { orgId: rule.orgId, status: { notIn: ["solved", "closed"] }, updatedAt: { lt: cutoff } },
    });

    for (const ticket of candidates) {
      // Don't re-fire for the same stretch of inactivity — only trigger
      // again once the ticket has seen activity (updatedAt moved forward)
      // since the last time this rule ran for it.
      const lastRun = await prisma.automationRunLog.findFirst({
        where: { ruleId: rule.id, ticketId: ticket.id },
        orderBy: { createdAt: "desc" },
      });
      if (lastRun && lastRun.createdAt > ticket.updatedAt) continue;

      await automationEngine.run(rule.orgId, "ticket_inactive", ticket);
    }
  }
}

async function tick() {
  if (running) return;
  running = true;

  try {
    const { breachedTickets } = await slaService.sweepBreachesAndEscalations();
    for (const { id, orgId } of breachedTickets) {
      const ticket = await prisma.ticket.findUnique({ where: { id } });
      if (ticket) await automationEngine.run(orgId, "sla_breached", ticket);
    }

    const approaching = await slaService.findApproaching(env.SLA_APPROACHING_WINDOW_MINUTES);
    for (const ticket of approaching) {
      await automationEngine.run(ticket.orgId, "sla_approaching", ticket);
      await prisma.ticket.update({ where: { id: ticket.id }, data: { slaApproachingNotifiedAt: new Date() } });
    }

    await runTicketInactiveTriggers();
  } catch (err) {
    logger.error({ err }, "SLA/automation sweep failed");
  } finally {
    running = false;
  }
}

export function startSlaAutomationWorker(): void {
  intervalHandle = setInterval(() => void tick(), env.SLA_SWEEP_INTERVAL_SECONDS * 1000);
  logger.info({ intervalSeconds: env.SLA_SWEEP_INTERVAL_SECONDS }, "SLA/automation worker started");
}

export function stopSlaAutomationWorker(): void {
  if (intervalHandle) clearInterval(intervalHandle);
}
