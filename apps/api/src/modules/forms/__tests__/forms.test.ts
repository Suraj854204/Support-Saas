import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: { intakeForm: { findUnique: vi.fn() }, ticket: { count: vi.fn() }, customer: { updateMany: vi.fn() }, ticketMessage: { create: vi.fn() } },
  evaluate: vi.fn(),
  bestEffort: vi.fn(),
  findOrCreate: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/modules/customers/customers.service", () => ({ customersService: { findOrCreateByEmail: m.findOrCreate } }));
vi.mock("@/modules/escalations/escalations.service", () => ({ escalationsService: { evaluate: m.evaluate } }));
vi.mock("@/lib/ai-client", () => ({ aiClient: { bestEffort: m.bestEffort, suggestReply: vi.fn() } }));
vi.mock("@/modules/tickets/tickets.service", () => ({ ticketsService: { create: m.create } }));

import { createFormSchema, submitFormSchema } from "../forms.schema";
import { composeFormMessage, deriveSubject, formsService, isOriginAllowed } from "../forms.service";

const form = { id: "f1", orgId: "o1", publicKey: "frm_x", isActive: true, allowedOrigins: [] as string[] };
const body = { email: "a@b.co", message: "Where is my order?" };

describe("pure helpers", () => {
  it("lists extra answers under the message", () => {
    expect(composeFormMessage("Hi", { "Order number": "1042", Empty: "" })).toBe("Hi\n\n---\nOrder number: 1042");
    expect(composeFormMessage("Hi")).toBe("Hi");
    expect(composeFormMessage("Hi", undefined, "Bot: hello")).toContain("--- Chat with the AI assistant ---\nBot: hello");
  });
  it("origin rules: empty list allows any, else exact match required", () => {
    expect(isOriginAllowed([], undefined)).toBe(true);
    expect(isOriginAllowed(["https://shop.com"], "https://shop.com/")).toBe(true);
    expect(isOriginAllowed(["https://shop.com"], "https://evil.com")).toBe(false);
    expect(isOriginAllowed(["https://shop.com"], undefined)).toBe(false);
  });
  it("derives a subject from the message when none is given", () => {
    expect(deriveSubject(undefined, "Where   is my order?")).toBe("Where is my order?");
    expect(deriveSubject("  ", "x".repeat(200))).toHaveLength(80);
    expect(deriveSubject("Refund", "ignored")).toBe("Refund");
  });
});

describe("schemas", () => {
  it("a Google Form needs a real Google Forms link", () => {
    const ok = createFormSchema.safeParse({ name: "n", source: "google_form", googleFormUrl: "https://docs.google.com/forms/d/e/abc/viewform" });
    expect(ok.success).toBe(true);
    expect(createFormSchema.safeParse({ name: "n", source: "google_form" }).success).toBe(false);
    expect(createFormSchema.safeParse({ name: "n", source: "google_form", googleFormUrl: "https://evil.com/forms" }).success).toBe(false);
    expect(createFormSchema.safeParse({ name: "n", source: "google_form", googleFormUrl: "http://docs.google.com/forms/x" }).success).toBe(false);
  });
  it("only accepts clean origins", () => {
    expect(createFormSchema.safeParse({ name: "n", allowedOrigins: ["https://a.com/"] }).data?.allowedOrigins).toEqual(["https://a.com"]);
    expect(createFormSchema.safeParse({ name: "n", allowedOrigins: ["https://a.com/path"] }).success).toBe(false);
    expect(createFormSchema.safeParse({ name: "n", allowedOrigins: ["javascript:alert(1)"] }).success).toBe(false);
  });
  it("accepts exactly what the Google script sends, including the no-email fallback", () => {
    const payload = { name: "", email: "no-email-abcdefghijkl@google-form.invalid", subject: "", message: "New Google Form response", fields: { Rating: "5", Topics: "a,b" } };
    expect(submitFormSchema.safeParse(payload).success).toBe(true);
  });
  it("phone and preference are validated", () => {
    expect(submitFormSchema.safeParse({ ...body, phone: "+91 98765-43210", contactPreference: "call" }).success).toBe(true);
    expect(submitFormSchema.safeParse({ ...body, phone: "<script>" }).success).toBe(false);
    expect(submitFormSchema.safeParse({ ...body, contactPreference: "fax" }).success).toBe(false);
  });
  it("needs a valid email and message", () => {
    expect(submitFormSchema.safeParse({ email: "nope", message: "x" }).success).toBe(false);
    expect(submitFormSchema.safeParse({ email: "a@b.co", message: "" }).success).toBe(false);
  });
});

describe("formsService.submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.findOrCreate.mockResolvedValue({ id: "c1", isBlocked: false, deletedAt: null });
    m.create.mockResolvedValue({ id: "t1", number: 7 });
    m.evaluate.mockResolvedValue(null);
    m.bestEffort.mockResolvedValue(null);
  });

  it("escalates serious matters, saves the phone and reports the 24h promise", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValue(form);
    m.evaluate.mockResolvedValue({ id: "e1" });
    const out = await formsService.submit("frm_x", undefined, { email: "a@b.co", message: "The heater is defective and smoking", phone: "+91 98765 43210", contactPreference: "call" });
    expect(out).toMatchObject({ escalated: true, contactWithinHours: 24 });
    expect(m.prisma.customer.updateMany).toHaveBeenCalledWith({ where: { id: "c1", phone: null }, data: { phone: "+91 98765 43210" } });
    expect(m.evaluate.mock.calls[0]![0]).toMatchObject({ orgId: "o1", ticketId: "t1", preferredMethod: "call" });
  });

  it("does not escalate or promise anything for an ordinary question", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValue(form);
    const out = await formsService.submit("frm_x", undefined, body);
    expect(out).toMatchObject({ escalated: false });
  });

  it("adds an internal AI draft only when the knowledge base matched something", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValue(form);
    m.bestEffort.mockImplementation(async () => ({ suggested_reply: "Refunds take 5 days.", confidence: 0.82, source_articles: [{ article_id: "a", title: "Refund policy", similarity: 0.9 }] }));
    await formsService.submit("frm_x", undefined, body);
    await new Promise((r) => setTimeout(r, 0));
    const data = m.prisma.ticketMessage.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ authorType: "ai", isInternalNote: true });
    expect(data.body).toContain("82% sure");

    m.prisma.ticketMessage.create.mockClear();
    m.bestEffort.mockImplementation(async () => ({ suggested_reply: "x", confidence: 0.2, source_articles: [] }));
    await formsService.submit("frm_x", undefined, body);
    await new Promise((r) => setTimeout(r, 0));
    expect(m.prisma.ticketMessage.create).not.toHaveBeenCalled();
  });

  it("creates a tagged api-channel ticket in the form's org", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValue(form);
    const out = await formsService.submit("frm_x", undefined, { ...body, fields: { Order: "9" } });
    expect(out).not.toBeNull();
    const [orgId, , input, extra] = m.create.mock.calls[0]!;
    expect(orgId).toBe("o1");
    expect(input).toMatchObject({ channel: "api", customerId: "c1", subject: "Where is my order?" });
    expect(input.initialMessage).toContain("Order: 9");
    expect(extra).toEqual({ tags: ["form:f1"] });
  });

  it("unknown and switched-off forms look identical", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValueOnce(null);
    await expect(formsService.submit("nope", undefined, body)).rejects.toThrow("not available");
    m.prisma.intakeForm.findUnique.mockResolvedValueOnce({ ...form, isActive: false });
    await expect(formsService.submit("frm_x", undefined, body)).rejects.toThrow("not available");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("rejects other sites when an allow-list is set", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValue({ ...form, allowedOrigins: ["https://shop.com"] });
    await expect(formsService.submit("frm_x", "https://evil.com", body)).rejects.toThrow("not allowed");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("lets a Google Form relay through without an Origin, since the public key is its credential", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValue({ ...form, source: "google_form", allowedOrigins: ["https://shop.com"] });
    expect(await formsService.submit("frm_x", undefined, body)).not.toBeNull();
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("silently drops honeypot hits without creating anything", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValue(form);
    expect(await formsService.submit("frm_x", undefined, { ...body, website: "http://spam" })).toBeNull();
    expect(m.findOrCreate).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("refuses blocked customers", async () => {
    m.prisma.intakeForm.findUnique.mockResolvedValue(form);
    m.findOrCreate.mockResolvedValue({ id: "c1", isBlocked: true, deletedAt: null });
    await expect(formsService.submit("frm_x", undefined, body)).rejects.toThrow("could not be accepted");
    expect(m.create).not.toHaveBeenCalled();
  });
});
