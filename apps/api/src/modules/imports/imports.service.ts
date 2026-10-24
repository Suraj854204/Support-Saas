import type { Prisma } from "@prisma/client";

import { buildExternalTag, parseZendeskCsv, type MappedTicketRow } from "./zendesk-mapper";

import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { customersService } from "@/modules/customers/customers.service";

const importsInFlight = new Set<string>();
const CLOSED_STATUSES = new Set(["solved", "closed"]);

export interface ImportSummary {
  dryRun: boolean;
  totalRows: number;
  valid: number;
  duplicates: number;
  invalid: number;
  toCreate: number;
  created: number;
  failed: number;
  newCustomers: number;
  errors: Array<{ line: number; message: string }>;
}

async function findExistingExternalIds(orgId: string, rows: MappedTicketRow[]): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const tags = rows.map((r) => buildExternalTag(r.externalId));
  const existing = await prisma.ticket.findMany({
    where: { orgId, tags: { hasSome: tags } },
    select: { tags: true },
  });
  const known = new Set<string>();
  for (const t of existing) for (const tag of t.tags) if (tag.startsWith("zd-")) known.add(tag.slice(3));
  return known;
}

async function countNewCustomers(orgId: string, rows: MappedTicketRow[]): Promise<number> {
  const emails = [...new Set(rows.map((r) => r.requesterEmail))];
  if (emails.length === 0) return 0;
  const found = await prisma.customer.findMany({
    where: { orgId, email: { in: emails } },
    select: { email: true },
  });
  return emails.length - found.length;
}

async function importRow(orgId: string, row: MappedTicketRow): Promise<void> {
  const customer = await customersService.findOrCreateByEmail(orgId, row.requesterEmail, row.requesterName);

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
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        channel: "api",
        customerId: customer.id,
        tags: ["imported", buildExternalTag(row.externalId)],
        createdAt: row.createdAt,
        ...(CLOSED_STATUSES.has(row.status) && { resolvedAt: row.createdAt }),
      },
    });

    if (row.description) {
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: "customer",
          authorId: null,
          body: row.description,
          createdAt: row.createdAt,
        },
      });
    }
  });
}

export const importsService = {
  /**
   * Imports a Zendesk-style tickets CSV. Historical data on purpose bypasses
   * automations, SLA timers, AI summaries, notifications and webhooks — an
   * import must never e-mail customers or fire hundreds of automations.
   * Re-importing the same file is safe: each ticket is tagged `zd-<id>` and
   * already-imported ids are skipped.
   */
  async importTickets(orgId: string, userId: string, csv: string, dryRun: boolean): Promise<ImportSummary> {
    if (!csv.trim()) throw AppError.validation("Send the CSV file as the request body (Content-Type: text/csv)");

    if (importsInFlight.has(orgId)) throw AppError.conflict("An import is already running for your organization");
    importsInFlight.add(orgId);

    try {
      const parsed = parseZendeskCsv(csv);
      const known = await findExistingExternalIds(orgId, parsed.rows);
      const fresh = parsed.rows.filter((r) => !known.has(r.externalId));

      const summary: ImportSummary = {
        dryRun,
        totalRows: parsed.totalRows,
        valid: parsed.rows.length,
        duplicates: parsed.rows.length - fresh.length,
        invalid: parsed.errorCount,
        toCreate: fresh.length,
        created: 0,
        failed: 0,
        newCustomers: dryRun ? await countNewCustomers(orgId, fresh) : 0,
        errors: [...parsed.errors],
      };

      if (dryRun) return summary;

      for (const row of fresh) {
        try {
          await importRow(orgId, row);
          summary.created++;
        } catch (err) {
          summary.failed++;
          logger.error({ err, orgId, line: row.line }, "Ticket import row failed");
          if (summary.errors.length < 100) summary.errors.push({ line: row.line, message: "Could not save this ticket" });
        }
      }

      await recordAudit({
        orgId,
        actorId: userId,
        action: "tickets.imported",
        targetType: "import",
        metadata: { source: "zendesk_csv", created: summary.created, duplicates: summary.duplicates, failed: summary.failed },
      });

      return summary;
    } finally {
      importsInFlight.delete(orgId);
    }
  },
};
