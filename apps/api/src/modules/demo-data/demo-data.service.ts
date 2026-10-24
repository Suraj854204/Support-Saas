import type { Prisma } from "@prisma/client";

import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const DEMO_TAG = "demo";
/** `.invalid` is reserved (RFC 2606): demo customers can never receive real e-mail. */
export const DEMO_EMAIL_DOMAIN = "demo.invalid";

type Status = "open" | "pending" | "on_hold" | "solved" | "closed";
type Priority = "low" | "normal" | "high" | "urgent";

interface DemoTicket {
  customer: { name: string; slug: string; vip?: boolean };
  subject: string;
  status: Status;
  priority: Priority;
  hoursAgo: number;
  messages: Array<{ from: "customer" | "agent"; body: string }>;
}

export const DEMO_TICKETS: DemoTicket[] = [
  {
    customer: { name: "Asha Rao", slug: "asha", vip: true },
    subject: "Refund still not received after 10 days",
    status: "open",
    priority: "urgent",
    hoursAgo: 3,
    messages: [{ from: "customer", body: "Hi, I returned my order 10 days ago and still have not seen the refund. Can you check?" }],
  },
  {
    customer: { name: "Daniel Okafor", slug: "daniel" },
    subject: "Cannot reset my password on mobile",
    status: "pending",
    priority: "high",
    hoursAgo: 8,
    messages: [
      { from: "customer", body: "The reset link opens a blank page on my phone." },
      { from: "agent", body: "Sorry about that. Could you tell me which browser you are using?" },
    ],
  },
  {
    customer: { name: "Mei Tanaka", slug: "mei" },
    subject: "Invoice shows the wrong billing address",
    status: "open",
    priority: "normal",
    hoursAgo: 20,
    messages: [{ from: "customer", body: "Our March invoice has our old office address. Can you update it and resend?" }],
  },
  {
    customer: { name: "Carlos Mendes", slug: "carlos" },
    subject: "How do I export my data?",
    status: "solved",
    priority: "low",
    hoursAgo: 40,
    messages: [
      { from: "customer", body: "Is there a way to export all my tickets as a file?" },
      { from: "agent", body: "Yes. Go to Settings, then Data, and choose Export. You will get an email with the file." },
    ],
  },
  {
    customer: { name: "Priya Nair", slug: "priya", vip: true },
    subject: "Widget not loading on checkout page",
    status: "open",
    priority: "high",
    hoursAgo: 1,
    messages: [{ from: "customer", body: "The chat widget disappears on our checkout page since this morning." }],
  },
];

export const demoDataService = {
  async status(orgId: string) {
    const tickets = await prisma.ticket.count({ where: { orgId, tags: { has: DEMO_TAG } } });
    return { active: tickets > 0, tickets };
  },

  /**
   * Adds a small set of clearly-marked sample tickets. Like the CSV import it
   * deliberately bypasses automations, e-mails, SLA timers and webhooks:
   * sample data must never contact anyone or fire real workflows.
   */
  async seed(orgId: string, userId: string) {
    const existing = await demoDataService.status(orgId);
    if (existing.active) throw AppError.conflict("Sample data is already loaded");

    const now = Date.now();
    for (const t of DEMO_TICKETS) {
      const email = `${t.customer.slug}@${DEMO_EMAIL_DOMAIN}`;
      const customer = await prisma.customer.upsert({
        where: { orgId_email: { orgId, email } },
        create: { orgId, email, name: t.customer.name, isVip: t.customer.vip ?? false, tags: [DEMO_TAG] },
        update: {},
      });
      const createdAt = new Date(now - t.hoursAgo * 3600_000);
      const resolved = t.status === "solved" || t.status === "closed";

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const org = await tx.organization.update({
          where: { id: orgId },
          data: { nextTicketNumber: { increment: 1 } },
          select: { nextTicketNumber: true },
        });
        const ticket = await tx.ticket.create({
          data: {
            orgId,
            number: org.nextTicketNumber - 1,
            subject: t.subject,
            status: t.status,
            priority: t.priority,
            channel: "api",
            customerId: customer.id,
            tags: [DEMO_TAG],
            createdAt,
            ...(resolved && { resolvedAt: createdAt }),
          },
        });
        for (const [i, m] of t.messages.entries()) {
          await tx.ticketMessage.create({
            data: {
              ticketId: ticket.id,
              authorType: m.from,
              authorId: m.from === "agent" ? userId : null,
              body: m.body,
              createdAt: new Date(createdAt.getTime() + i * 15 * 60_000),
            },
          });
        }
      });
    }

    await recordAudit({ orgId, actorId: userId, action: "demo_data.loaded", targetType: "demo_data", metadata: { tickets: DEMO_TICKETS.length } });
    return { tickets: DEMO_TICKETS.length };
  },

  /** Removes only what seed() created: tickets tagged demo and customers on the reserved demo domain. */
  async clear(orgId: string, userId: string) {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const tickets = await tx.ticket.deleteMany({ where: { orgId, tags: { has: DEMO_TAG } } });
      const customers = await tx.customer.deleteMany({
        where: { orgId, email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, tickets: { none: {} } },
      });
      return { tickets: tickets.count, customers: customers.count };
    });
    await recordAudit({ orgId, actorId: userId, action: "demo_data.cleared", targetType: "demo_data", metadata: result });
    return result;
  },
};
