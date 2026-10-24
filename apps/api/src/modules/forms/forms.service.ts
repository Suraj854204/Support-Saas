import type { Prisma } from "@prisma/client";

import type { CreateFormInput, SubmissionsQuery, SubmitFormInput, UpdateFormInput } from "./forms.schema";

import { aiClient } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { generateRawToken } from "@/lib/security";
import { entitlementsService } from "@/modules/billing/entitlements.service";
import { customersService } from "@/modules/customers/customers.service";
import { escalationsService } from "@/modules/escalations/escalations.service";
import { assessSeverity, CONTACT_WINDOW_HOURS } from "@/modules/escalations/severity";
import { ticketsService } from "@/modules/tickets/tickets.service";

export const FORM_KEY_PREFIX = "frm_";
export const formTag = (formId: string) => `form:${formId}`;

/** Pure: the ticket's first message, with any extra form answers listed underneath. */
export function composeFormMessage(message: string, fields?: Record<string, string>, transcript?: string): string {
  const extra = Object.entries(fields ?? {}).filter(([, v]) => v.length > 0);
  let out = message;
  if (extra.length > 0) out += `\n\n---\n${extra.map(([k, v]) => `${k}: ${v}`).join("\n")}`;
  if (transcript) out += `\n\n--- Chat with the AI assistant ---\n${transcript}`;
  return out;
}

/** Internal note with the AI's suggested answer, so an agent can reply in one click. Best-effort and never sent to the customer. */
async function addAiDraftNote(orgId: string, ticketId: string, text: string): Promise<void> {
  const result = await aiClient.bestEffort(
    () => aiClient.suggestReply({ orgId, ticketId, messages: [{ author_type: "customer", body: text }] }),
    "forms.submit.ai-draft"
  );
  if (!result || result.source_articles.length === 0) return; // nothing in the knowledge base matched: no guess
  const sources = result.source_articles.map((a) => a.title).join(", ");
  await prisma.ticketMessage.create({
    data: {
      ticketId,
      authorType: "ai",
      aiGenerated: true,
      isInternalNote: true,
      body: `AI draft (${Math.round(result.confidence * 100)}% sure, from: ${sources})\n\n${result.suggested_reply}\n\nReview before sending. The customer has not seen this.`,
    },
  });
}

/** Pure: no allow-list means any site may post; otherwise the browser Origin must match. */
export function isOriginAllowed(allowed: string[], origin: string | undefined): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  return allowed.includes(origin.replace(/\/$/, ""));
}

export function deriveSubject(subject: string | undefined, message: string): string {
  const s = subject?.trim();
  if (s) return s;
  const line = message.replace(/\s+/g, " ").trim();
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

export const formsService = {
  async list(orgId: string) {
    const forms = await prisma.intakeForm.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
    return Promise.all(
      forms.map(async (f) => ({
        id: f.id,
        name: f.name,
        publicKey: f.publicKey,
        allowedOrigins: f.allowedOrigins,
        isActive: f.isActive,
        source: f.source,
        googleFormUrl: f.googleFormUrl,
        createdAt: f.createdAt,
        submissions: await prisma.ticket.count({ where: { orgId, tags: { has: formTag(f.id) } } }),
      }))
    );
  },

  async create(orgId: string, userId: string, input: CreateFormInput) {
    await entitlementsService.assertCanAdd(orgId, "forms");
    const form = await prisma.intakeForm.create({
      data: {
        orgId,
        createdById: userId,
        name: input.name,
        allowedOrigins: input.source === "google_form" ? [] : input.allowedOrigins,
        source: input.source,
        googleFormUrl: input.source === "google_form" ? (input.googleFormUrl ?? null) : null,
        publicKey: `${FORM_KEY_PREFIX}${generateRawToken(16)}`,
      },
    });
    await recordAudit({ orgId, actorId: userId, action: "form.created", targetType: "form", targetId: form.id });
    return form;
  },

  async update(orgId: string, id: string, userId: string, input: UpdateFormInput) {
    const existing = await prisma.intakeForm.findFirst({ where: { id, orgId } });
    if (!existing) throw AppError.notFound("Form not found");
    const form = await prisma.intakeForm.update({ where: { id }, data: input });
    await recordAudit({ orgId, actorId: userId, action: "form.updated", targetType: "form", targetId: id });
    return form;
  },

  async remove(orgId: string, id: string, userId: string) {
    const { count } = await prisma.intakeForm.deleteMany({ where: { id, orgId } });
    if (count === 0) throw AppError.notFound("Form not found");
    await recordAudit({ orgId, actorId: userId, action: "form.deleted", targetType: "form", targetId: id });
  },

  /** Public entry point. Returns null when a bot filled the honeypot so the caller can pretend success. */
  async submit(publicKey: string, origin: string | undefined, input: SubmitFormInput) {
    const form = await prisma.intakeForm.findUnique({ where: { publicKey } });
    // Same message for unknown and switched-off forms: keys can't be probed.
    if (!form || !form.isActive) throw AppError.notFound("This form is not available");
    // Google Forms are relayed by a Google script (no browser, so no Origin): the public key is the credential.
    if (form.source !== "google_form" && !isOriginAllowed(form.allowedOrigins, origin)) throw AppError.forbidden("This site is not allowed to use this form");

    if (input.website && input.website.length > 0) return null;

    const customer = await customersService.findOrCreateByEmail(form.orgId, input.email, input.name?.trim() || null);
    if (customer.isBlocked || customer.deletedAt) throw AppError.forbidden("Your message could not be accepted");

    if (input.phone) await prisma.customer.updateMany({ where: { id: customer.id, phone: null }, data: { phone: input.phone } });

    const message = composeFormMessage(input.message, input.fields, input.transcript);
    const ticket = await ticketsService.create(
      form.orgId,
      `form:${form.id}`,
      {
        subject: deriveSubject(input.subject, input.message),
        customerId: customer.id,
        channel: "api",
        priority: "normal",
        initialMessage: message,
      },
      { tags: [formTag(form.id)] }
    );

    // Serious matters (suspected defect, safety, legal/fraud, large amounts) get a 24-hour "contact the client" deadline.
    // Only the customer's own words are judged, not the chat transcript's AI answers.
    const judged = [input.subject ?? "", input.message, ...Object.values(input.fields ?? {})].join("\n");
    const severity = assessSeverity(`${judged}\n${input.transcript ?? ""}`);
    const escalation = await escalationsService.evaluate({
      orgId: form.orgId,
      ticketId: ticket.id,
      text: judged,
      severity,
      preferredMethod: input.contactPreference ?? null,
    });

    void addAiDraftNote(form.orgId, ticket.id, input.message);
    return { ticket, form, escalated: escalation !== null, contactWithinHours: CONTACT_WINDOW_HOURS };
  },

  async submissions(orgId: string, q: SubmissionsQuery) {
    const forms = await prisma.intakeForm.findMany({ where: { orgId }, select: { id: true, name: true } });
    if (forms.length === 0) return { items: [], meta: { page: q.page, pageSize: q.pageSize, totalItems: 0, totalPages: 0 } };

    const wanted = q.formId ? forms.filter((f) => f.id === q.formId) : forms;
    if (wanted.length === 0) throw AppError.notFound("Form not found");
    const nameByTag = new Map(forms.map((f) => [formTag(f.id), f.name]));

    const where: Prisma.TicketWhereInput = {
      orgId,
      tags: { hasSome: wanted.map((f) => formTag(f.id)) },
      ...(q.status && { status: q.status }),
      ...(q.withinHours && { createdAt: { gte: new Date(Date.now() - q.withinHours * 3600_000) } }),
      ...(q.search && {
        OR: [
          { subject: { contains: q.search, mode: "insensitive" } },
          { customer: { email: { contains: q.search, mode: "insensitive" } } },
          { customer: { name: { contains: q.search, mode: "insensitive" } } },
          { messages: { some: { body: { contains: q.search, mode: "insensitive" } } } },
        ],
      }),
    };

    const [rows, totalItems] = await prisma.$transaction([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          tags: true,
          createdAt: true,
          customer: { select: { id: true, name: true, email: true } },
          escalation: { select: { level: true, contactedAt: true, contactDueAt: true } },
          messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    const items = rows.map((t) => {
      const tag = t.tags.find((x) => nameByTag.has(x));
      return {
        id: t.id,
        number: t.number,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        customer: t.customer,
        formName: tag ? (nameByTag.get(tag) ?? null) : null,
        formId: tag ? tag.slice("form:".length) : null,
        preview: (t.messages[0]?.body ?? "").slice(0, 400),
        escalation: t.escalation
          ? { level: t.escalation.level, contacted: t.escalation.contactedAt !== null, contactDueAt: t.escalation.contactDueAt }
          : null,
      };
    });
    return { items, meta: { page: q.page, pageSize: q.pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / q.pageSize)) } };
  },
};
