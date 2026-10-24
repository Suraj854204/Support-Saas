import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    ticket: { findFirst: vi.fn(), update: vi.fn() },
    ticketMessage: { create: vi.fn() },
    customer: { updateMany: vi.fn() },
    callRequest: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn() },
    user: { findFirst: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
  audit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.audit }));

import { callRequestsService, normalizePhone } from "../call-requests.service";

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", tags: [] });
  m.prisma.callRequest.findFirst.mockResolvedValue(null);
  m.prisma.callRequest.create.mockResolvedValue({ id: "r1", phone: "+919876543210", status: "requested" });
});

describe("normalizePhone", () => {
  it("keeps digits and a leading plus, rejects anything else", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("+919876543210");
    expect(normalizePhone("(022) 2345 6789")).toBe("02223456789");
    for (const bad of ["abc", "123", "1".repeat(16), "+91 98765 <script>", "", "12345 ext 99"]) expect(normalizePhone(bad)).toBeNull();
  });
});

describe("customer call request", () => {
  it("only on the visitor's own conversation", async () => {
    m.prisma.ticket.findFirst.mockResolvedValue(null);
    await expect(callRequestsService.createFromCustomer("orgB", "custX", "t1", { phone: "+919876543210" })).rejects.toMatchObject({ statusCode: 404 });
    expect(m.prisma.ticket.findFirst.mock.calls[0]![0].where).toEqual({ id: "t1", orgId: "orgB", customerId: "custX" });
    expect(m.prisma.callRequest.create).not.toHaveBeenCalled();
  });
  it("rejects an invalid number", async () => {
    await expect(callRequestsService.createFromCustomer("o", "c", "t1", { phone: "not a phone" })).rejects.toMatchObject({ statusCode: 422 });
  });
  it("creates the request, a system note, the tag, and fills an empty customer phone", async () => {
    const r = await callRequestsService.createFromCustomer("o", "c", "t1", { phone: "+91 98765 43210", preferredTime: "after 5pm" });
    expect(r.duplicate).toBe(false);
    expect(m.prisma.callRequest.create.mock.calls[0]![0].data).toMatchObject({ orgId: "o", ticketId: "t1", customerId: "c", phone: "+919876543210", preferredTime: "after 5pm" });
    expect(m.prisma.ticketMessage.create.mock.calls[0]![0].data).toMatchObject({ authorType: "system" });
    expect(m.prisma.ticket.update.mock.calls[0]![0].data.tags).toContain("call-request");
    expect(m.prisma.customer.updateMany.mock.calls[0]![0]).toMatchObject({ where: { id: "c", orgId: "o", phone: null } });
  });
  it("asking twice returns the open request instead of creating another", async () => {
    m.prisma.callRequest.findFirst.mockResolvedValue({ id: "r0", status: "requested" });
    const r = await callRequestsService.createFromCustomer("o", "c", "t1", { phone: "+919876543210" });
    expect(r).toMatchObject({ duplicate: true, request: { id: "r0" } });
    expect(m.prisma.callRequest.create).not.toHaveBeenCalled();
  });
});

describe("staff handling", () => {
  it("lists open requests of the caller's org only", async () => {
    m.prisma.callRequest.findMany.mockResolvedValue([]);
    await callRequestsService.list("orgA");
    expect(m.prisma.callRequest.findMany.mock.calls[0]![0].where).toEqual({ orgId: "orgA", status: { in: ["requested", "scheduled"] } });
  });
  it("cannot touch another org's request or assign to a foreign user", async () => {
    m.prisma.callRequest.findFirst.mockResolvedValue(null);
    await expect(callRequestsService.update("orgA", "r1", "u1", { status: "completed" })).rejects.toMatchObject({ statusCode: 404 });
    m.prisma.callRequest.findFirst.mockResolvedValue({ id: "r1", status: "requested" });
    m.prisma.user.findFirst.mockResolvedValue(null);
    await expect(callRequestsService.update("orgA", "r1", "u1", { assigneeId: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ statusCode: 422 });
    expect(m.prisma.callRequest.updateMany).not.toHaveBeenCalled();
  });
  it("completing records the time and an audit entry, scoped to the org", async () => {
    m.prisma.callRequest.findFirst.mockResolvedValue({ id: "r1", status: "requested" });
    m.prisma.callRequest.updateMany.mockResolvedValue({ count: 1 });
    m.prisma.callRequest.findFirstOrThrow.mockResolvedValue({ id: "r1", status: "completed" });
    await callRequestsService.update("orgA", "r1", "u1", { status: "completed" });
    const call = m.prisma.callRequest.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "r1", orgId: "orgA" });
    expect(call.data.handledAt).toBeInstanceOf(Date);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "call_request.updated" }));
  });
});
