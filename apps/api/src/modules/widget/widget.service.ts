import type { Prisma } from "@prisma/client";

import type { StartConversationInput } from "./widget.schema";

import { aiClient } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";


const OPEN_STATUSES = ["open", "pending", "on_hold"] as const;

export const widgetService = {
  async resolveOrgBySlug(orgSlug: string) {
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw AppError.notFound("Unknown widget — check your organization slug");
    return org;
  },

  /**
   * Starts a new conversation, or resumes the visitor's existing open
   * ticket if `existingCustomerId` (from a previously issued widget token)
   * still resolves to a customer in this org.
   */
  async startConversation(orgSlug: string, existingCustomerId: string | undefined, input: StartConversationInput) {
    const org = await this.resolveOrgBySlug(orgSlug);

    let customer = existingCustomerId
      ? await prisma.customer.findFirst({ where: { id: existingCustomerId, orgId: org.id } })
      : null;

    if (!customer) {
      customer = await prisma.customer.create({
        data: { orgId: org.id, name: input.name ?? null, email: input.email ?? null },
      });
    }

    let ticket = await prisma.ticket.findFirst({
      where: { orgId: org.id, customerId: customer.id, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: "desc" },
    });

    if (!ticket) {
      ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updatedOrg = await tx.organization.update({
          where: { id: org.id },
          data: { nextTicketNumber: { increment: 1 } },
          select: { nextTicketNumber: true },
        });
        return tx.ticket.create({
          data: {
            orgId: org.id,
            number: updatedOrg.nextTicketNumber - 1,
            subject: "Website chat",
            customerId: customer.id,
            channel: "web_widget",
          },
        });
      });
    }

    return { org, customer, ticket };
  },

  async getConversation(orgId: string, customerId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, orgId, customerId },
      include: {
        messages: {
          where: { isInternalNote: false }, // never leak internal notes to the customer
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!ticket) throw AppError.notFound("Conversation not found");
    return ticket;
  },

  async addCustomerMessage(orgId: string, customerId: string, ticketId: string, body: string) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId, customerId } });
    if (!ticket) throw AppError.notFound("Conversation not found");

    const message = await prisma.ticketMessage.create({
      data: { ticketId, authorType: "customer", authorId: null, body },
    });

    // Best-effort — keep the AI summary/sentiment fresh as the conversation evolves.
    const history = await prisma.ticketMessage.findMany({
      where: { ticketId, isInternalNote: false },
      orderBy: { createdAt: "asc" },
      select: { authorType: true, body: true },
    });
    const summary = await aiClient.bestEffort(
      () =>
        aiClient.summarizeTicket({
          orgId,
          ticketId,
          messages: history.map((m: { authorType: string; body: string }) => ({
            author_type: m.authorType as "customer" | "agent" | "ai" | "system",
            body: m.body,
          })),
        }),
      "widget.addMessage.summarize"
    );
    if (summary) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { aiSummary: summary.summary, aiSentiment: summary.sentiment },
      });
    }

    return message;
  },
};
