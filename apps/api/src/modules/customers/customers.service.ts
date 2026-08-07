import { Prisma } from "@prisma/client";

import type { CreateCustomerInput, MergeCustomerInput, UpdateCustomerInput } from "./customers.schema";

import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const RESOLVED_STATUSES = new Set(["solved", "closed"]);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getActiveCustomerOrThrow(orgId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, orgId, deletedAt: null } });
  if (!customer) throw AppError.notFound("Customer not found");
  return customer;
}

export const customersService = {
  async list(orgId: string, search?: string) {
    return prisma.customer.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  async create(orgId: string, input: CreateCustomerInput) {
    if (!input.name && !input.email) {
      throw AppError.validation("Provide at least a name or an email for the customer");
    }

    const email = input.email ? normalizeEmail(input.email) : null;

    try {
      return await prisma.customer.create({ data: { orgId, name: input.name ?? null, email } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw AppError.conflict("A customer with this email already exists in your organization");
      }
      throw err;
    }
  },

  /**
   * Org-safe find-or-create used by the Gmail email-to-ticket pipeline
   * (Feature 6) — never creates a customer for an invalid/missing sender
   * email, and relies on the `[orgId, email]` unique constraint (racing
   * inbound messages from the same new sender resolve to one customer row,
   * not two).
   */
  async findOrCreateByEmail(orgId: string, email: string, name: string | null) {
    const normalized = normalizeEmail(email);

    const existing = await prisma.customer.findUnique({
      where: { orgId_email: { orgId, email: normalized } },
    });
    if (existing) return existing;

    try {
      return await prisma.customer.create({ data: { orgId, email: normalized, name } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Lost a race with another concurrent inbound message from the same
        // sender — the row now exists, just fetch it.
        const raceWinner = await prisma.customer.findUnique({
          where: { orgId_email: { orgId, email: normalized } },
        });
        if (raceWinner) return raceWinner;
      }
      throw err;
    }
  },

  /** Full profile view: the customer plus computed ticket stats and recent history. */
  async getById(orgId: string, customerId: string) {
    const customer = await getActiveCustomerOrThrow(orgId, customerId);

    const tickets = await prisma.ticket.findMany({
      where: { orgId, customerId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true, updatedAt: true },
    });

    const totalTickets = tickets.length;
    const openTickets = tickets.filter((t) => !RESOLVED_STATUSES.has(t.status)).length;
    const lastInteraction = tickets[0]?.updatedAt ?? customer.createdAt;

    return { ...customer, stats: { totalTickets, openTickets, lastInteraction }, tickets };
  },

  async update(orgId: string, customerId: string, input: UpdateCustomerInput) {
    await getActiveCustomerOrThrow(orgId, customerId);
    return prisma.customer.update({ where: { id: customerId }, data: input });
  },

  /**
   * Merges `source` into `input.targetCustomerId`: every ticket owned by
   * `source` is reassigned to the target, then `source` is soft-deleted
   * (its own history is preserved for audit, just no longer a live
   * customer record) with a note pointing at the merge target.
   */
  async merge(orgId: string, sourceCustomerId: string, input: MergeCustomerInput, actorId: string) {
    if (sourceCustomerId === input.targetCustomerId) {
      throw AppError.validation("Can't merge a customer into itself");
    }

    const [source, target] = await Promise.all([
      getActiveCustomerOrThrow(orgId, sourceCustomerId),
      getActiveCustomerOrThrow(orgId, input.targetCustomerId),
    ]);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.ticket.updateMany({
        where: { orgId, customerId: source.id },
        data: { customerId: target.id },
      });

      await tx.customer.update({
        where: { id: source.id },
        data: {
          deletedAt: new Date(),
          name: null,
          email: null,
          phone: null,
          metadata: { ...(source.metadata as Record<string, unknown>), mergedIntoCustomerId: target.id },
        },
      });
    });

    await recordAudit({
      orgId,
      actorId,
      action: "customer.merged",
      targetType: "customer",
      targetId: target.id,
      metadata: { sourceCustomerId: source.id },
    });

    return this.getById(orgId, target.id);
  },

  /** A full export of everything this org holds about the customer — their profile and ticket/message history. */
  async exportData(orgId: string, customerId: string) {
    const customer = await getActiveCustomerOrThrow(orgId, customerId);

    const tickets = await prisma.ticket.findMany({
      where: { orgId, customerId },
      orderBy: { createdAt: "asc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    return {
      exportedAt: new Date().toISOString(),
      customer,
      tickets: tickets.map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        channel: t.channel,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messages: t.messages
          // Internal agent notes are the organization's working notes, not
          // data collected from/about the customer — excluded from their export.
          .filter((m) => !m.isInternalNote)
          .map((m) => ({ authorType: m.authorType, body: m.body, createdAt: m.createdAt })),
      })),
    };
  },

  /** Redacts PII and marks the customer deleted. Ticket history stays intact (organization record-keeping), the customer's identity does not. */
  async requestDeletion(orgId: string, customerId: string, actorId: string) {
    const customer = await getActiveCustomerOrThrow(orgId, customerId);

    const anonymized = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        name: null,
        email: null,
        phone: null,
        avatarUrl: null,
        externalId: null,
        deletedAt: new Date(),
      },
    });

    await recordAudit({
      orgId,
      actorId,
      action: "customer.deleted",
      targetType: "customer",
      targetId: customer.id,
    });

    return anonymized;
  },
};
