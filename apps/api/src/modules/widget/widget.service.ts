import { Prisma } from "@prisma/client";

import { CUSTOMER_MESSAGE_SELECT } from "./ai-reply.service";
import type { StartConversationInput } from "./widget.schema";

import { aiClient } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";
import { automationEngine } from "@/modules/automations/automation-engine.service";
import { ATTACHMENT_SELECT, chatAttachmentsService, presentMessage } from "@/modules/chat-attachments/chat-attachments.service";
import { computeSlaDueDates, resolveBusinessHours, resolveSlaPolicy } from "@/modules/sla/sla-policy";


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

    let created = false;
    if (!ticket) {
      created = true;
      const slaPolicy = resolveSlaPolicy(org.slaPolicy);
      const businessHours = resolveBusinessHours(org.businessHours);
      const createdAt = new Date();
      const { firstResponseDueAt, resolutionDueAt } = computeSlaDueDates(
        createdAt,
        org.defaultTicketPriority,
        slaPolicy,
        businessHours
      );

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
            priority: org.defaultTicketPriority,
            firstResponseDueAt,
            slaBreachAt: resolutionDueAt,
          },
        });
      });

      void automationEngine.run(org.id, "ticket_created", ticket);
    }

    return { org, customer, ticket, created };
  },

  async getConversation(orgId: string, customerId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, orgId, customerId },
      include: {
        messages: {
          where: { isInternalNote: false }, // never leak internal notes to the customer
          orderBy: { createdAt: "asc" },
          select: { ...CUSTOMER_MESSAGE_SELECT, attachments: { select: ATTACHMENT_SELECT } }, // no staff ids, AI meta or internal fields
        },
      },
    });
    if (!ticket) throw AppError.notFound("Conversation not found");
    return { ...ticket, messages: ticket.messages.map(presentMessage) };
  },

  /**
   * Stores a customer message. With a `clientMessageId` the call is idempotent: a retry returns the
   * original message with `duplicate: true`, and the caller must not run AI, events or emails again.
   */
  async addCustomerMessage(orgId: string, customerId: string, ticketId: string, body: string, clientMessageId?: string, attachmentIds: string[] = []) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId, customerId } });
    if (!ticket) throw AppError.notFound("Conversation not found");
    const uploader = { type: "customer" as const, id: customerId };
    // Checked before anything is stored, so a bad attachment id never leaves a half-sent message behind.
    await chatAttachmentsService.assertLinkable(orgId, ticketId, attachmentIds, uploader);

    let message;
    try {
      message = await prisma.ticketMessage.create({
        data: { ticketId, authorType: "customer", authorId: null, body, clientMessageId: clientMessageId ?? null },
      });
    } catch (err) {
      if (clientMessageId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await prisma.ticketMessage.findFirst({ where: { ticketId, clientMessageId } });
        if (existing) return { message: await this.withAttachments(existing.id), duplicate: true };
      }
      throw err;
    }
    await chatAttachmentsService.link(orgId, ticketId, message.id, attachmentIds, uploader);

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { lastCustomerActivityAt: new Date() },
    });
    void automationEngine.run(orgId, "customer_replied", updatedTicket, { messageText: body });

    // Keep the AI summary/sentiment fresh, but never make the visitor wait for it.
    void this.refreshSummary(orgId, ticketId);

    return { message: await this.withAttachments(message.id), duplicate: false };
  },

  /** The message as clients see it: with its files (short-lived links) attached. */
  async withAttachments(messageId: string) {
    return presentMessage(await prisma.ticketMessage.findUniqueOrThrow({ where: { id: messageId }, include: { attachments: { select: ATTACHMENT_SELECT } } }));
  },

  async uploadFile(orgId: string, customerId: string, ticketId: string, file: { buffer: Buffer; originalname: string }) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId, customerId }, select: { id: true } });
    if (!ticket) throw AppError.notFound("Conversation not found");
    return chatAttachmentsService.upload(orgId, ticketId, { type: "customer", id: customerId }, file);
  },

  async refreshSummary(orgId: string, ticketId: string) {
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
      await prisma.ticket.update({ where: { id: ticketId }, data: { aiSummary: summary.summary, aiSentiment: summary.sentiment } });
    }
  },
};
