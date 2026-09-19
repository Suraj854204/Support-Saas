import type { TicketPriority } from "@support-saas/shared-types";
import { v4 as uuid } from "uuid";

import { computeSlaDueDates, resolveBusinessHours, resolveSlaPolicy } from "./sla-policy";

import { env } from "@/config/env";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { escalationNoticeTemplate } from "@/services/email-templates/escalation-notice.template";
import { mailService } from "@/services/mail.service";

export const slaService = {
  /** Computes an org's current due dates for a given priority, starting from `createdAt`. Call at ticket creation. */
  async computeDueDatesForOrg(orgId: string, priority: TicketPriority, createdAt: Date) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { slaPolicy: true, businessHours: true },
    });
    const policy = resolveSlaPolicy(org?.slaPolicy);
    const businessHours = resolveBusinessHours(org?.businessHours);
    return computeSlaDueDates(createdAt, priority, policy, businessHours);
  },

  /** Marks the first public agent response on a ticket, if it hasn't happened yet. No-op otherwise (never overwrites the first timestamp). */
  async markFirstResponse(ticketId: string) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { firstRespondedAt: true } });
    if (!ticket || ticket.firstRespondedAt) return;
    await prisma.ticket.update({ where: { id: ticketId }, data: { firstRespondedAt: new Date() } });
  },

  /**
   * Background sweep: finds tickets whose first-response or resolution SLA
   * has passed (and aren't already flagged), marks them breached, and
   * escalates ones that have been breached long enough per the org's
   * escalation settings. Returns counts for the worker to log.
   */
  async sweepBreachesAndEscalations(): Promise<{ breachedTickets: { id: string; orgId: string }[]; escalated: number }> {
    const now = new Date();
    let escalated = 0;

    const overdue = await prisma.ticket.findMany({
      where: {
        status: { notIn: ["solved", "closed"] },
        slaBreached: false,
        OR: [
          { firstRespondedAt: null, firstResponseDueAt: { lt: now } },
          { slaBreachAt: { lt: now } },
        ],
      },
      select: { id: true, orgId: true },
    });

    for (const ticket of overdue) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { slaBreached: true } });
    }

    // Escalation: already-breached tickets, not yet escalated, whose org
    // has escalation enabled and enough time has passed since breach.
    const breachedTickets = await prisma.ticket.findMany({
      where: {
        status: { notIn: ["solved", "closed"] },
        slaBreached: true,
        escalatedAt: null,
      },
      select: {
        id: true,
        orgId: true,
        number: true,
        subject: true,
        assigneeId: true,
        slaBreachAt: true,
        firstResponseDueAt: true,
      },
    });

    for (const ticket of breachedTickets) {
      const org = await prisma.organization.findUnique({
        where: { id: ticket.orgId },
        select: { slaPolicy: true },
      });
      const policy = resolveSlaPolicy(org?.slaPolicy);
      if (!policy.escalationEnabled) continue;

      const breachedAt = ticket.slaBreachAt ?? ticket.firstResponseDueAt;
      if (!breachedAt) continue;

      const minutesSinceBreach = (now.getTime() - breachedAt.getTime()) / 60_000;
      if (minutesSinceBreach < policy.escalateAfterMinutes) continue;

      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          escalatedAt: now,
          ...(policy.escalateToUserId && { assigneeId: policy.escalateToUserId }),
        },
      });
      escalated++;

      if (policy.escalateToUserId) {
        void publishEvent(KAFKA_TOPICS.TICKET_ASSIGNED, {
          eventId: uuid(),
          orgId: ticket.orgId,
          occurredAt: now.toISOString(),
          ticketId: ticket.id,
          assigneeId: policy.escalateToUserId,
          previousAssigneeId: ticket.assigneeId,
        });

        const agent = await prisma.user.findUnique({ where: { id: policy.escalateToUserId } });
        if (agent) {
          const { subject, html, text } = escalationNoticeTemplate({
            agentName: agent.name,
            ticketNumber: `SUP-${ticket.number}`,
            ticketSubject: ticket.subject,
            ticketUrl: `${env.NEXT_PUBLIC_APP_URL}/tickets/${ticket.id}`,
            minutesPastDue: minutesSinceBreach,
          });
          const result = await mailService.send({ to: agent.email, subject, html, text });
          if (!result.delivered) {
            logger.warn(
              { ticketId: ticket.id, agentId: agent.id, error: result.error },
              "Escalation notification email was not delivered"
            );
          }
        }
      }
    }

    if (overdue.length > 0 || escalated > 0) {
      logger.info({ breached: overdue.length, escalated }, "SLA sweep complete");
    }

    return { breachedTickets: overdue, escalated };
  },

  /**
   * Tickets within `windowMinutes` of their first-response or resolution
   * deadline, not yet breached, and not already notified this cycle
   * (`slaApproachingNotifiedAt` guards against firing on every tick).
   * Caller is responsible for stamping `slaApproachingNotifiedAt` once it
   * has actually fired the automation trigger.
   */
  async findApproaching(windowMinutes: number) {
    const now = new Date();
    const horizon = new Date(now.getTime() + windowMinutes * 60_000);

    return prisma.ticket.findMany({
      where: {
        status: { notIn: ["solved", "closed"] },
        slaBreached: false,
        slaApproachingNotifiedAt: null,
        OR: [
          { firstRespondedAt: null, firstResponseDueAt: { gte: now, lte: horizon } },
          { slaBreachAt: { gte: now, lte: horizon } },
        ],
      },
    });
  },
};
