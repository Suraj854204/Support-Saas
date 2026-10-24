import type { PublicCreateTicketInput } from "./public-api.schema";

import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";
import { customersService } from "@/modules/customers/customers.service";
import { ticketsService } from "@/modules/tickets/tickets.service";
import { widgetService } from "@/modules/widget/widget.service";

/**
 * Fields exposed to API consumers. Deliberately an allow-list: internal
 * notes, AI summaries, SLA internals and assignee details stay inside the
 * helpdesk.
 */
const TICKET_SELECT = {
  id: true,
  number: true,
  subject: true,
  status: true,
  priority: true,
  channel: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
} as const;

/** Picks the public fields from a full ticket row (used after creation, where the full row is also needed for events). */
export function toPublicTicket<T extends { id: string }>(ticket: T) {
  const t = ticket as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.keys(TICKET_SELECT).map((key) => [key, t[key]])) as {
    id: string;
    number: number;
    subject: string;
    status: string;
    priority: string;
    channel: string;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
  };
}

export const publicApiService = {
  async createTicket(orgId: string, apiKeyId: string, input: PublicCreateTicketInput) {
    const customer = await customersService.findOrCreateByEmail(orgId, input.customer.email, input.customer.name ?? null);

    if (customer.isBlocked) throw AppError.forbidden("This customer is blocked");
    if (customer.deletedAt) throw AppError.conflict("This customer has been deleted");

    // Goes through the same service as dashboard-created tickets, so SLA
    // due dates, ticket numbering, automations and AI summarisation behave
    // identically for tickets that arrive over the API.
    const ticket = await ticketsService.create(orgId, `api_key:${apiKeyId}`, {
      subject: input.subject,
      customerId: customer.id,
      channel: "api",
      priority: input.priority,
      initialMessage: input.message,
    });

    return ticket;
  },

  async listTickets(orgId: string, query: { status?: string; page: number; pageSize: number }) {
    const where = { orgId, ...(query.status && { status: query.status as never }) };

    const [items, totalItems] = await prisma.$transaction([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: TICKET_SELECT,
      }),
      prisma.ticket.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
      },
    };
  },

  async getTicket(orgId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, orgId },
      select: {
        ...TICKET_SELECT,
        messages: {
          where: { isInternalNote: false },
          orderBy: { createdAt: "asc" },
          select: { id: true, authorType: true, body: true, createdAt: true },
        },
      },
    });
    if (!ticket) throw AppError.notFound("Ticket not found");
    return ticket;
  },

  /** Appends a customer-authored message — e.g. a reply forwarded from the integrator's own system. */
  async addCustomerMessage(orgId: string, ticketId: string, message: string) {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, orgId }, select: { customerId: true } });
    if (!ticket) throw AppError.notFound("Ticket not found");

    return (await widgetService.addCustomerMessage(orgId, ticket.customerId, ticketId, message)).message;
  },
};
