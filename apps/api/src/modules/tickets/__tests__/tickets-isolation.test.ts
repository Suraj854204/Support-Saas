import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    ticket: { findFirst: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
    team: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/kafka", () => ({ KAFKA_TOPICS: {}, publishEvent: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ aiClient: {} }));
vi.mock("@/modules/automations/automation-engine.service", () => ({ automationEngine: { run: vi.fn() } }));
vi.mock("@/modules/billing/entitlements.service", () => ({ entitlementsService: {} }));
vi.mock("@/modules/sla/sla.service", () => ({ slaService: {} }));
vi.mock("@/modules/ticket-tracking/ticket-tracking.service", () => ({ ticketTrackingService: {} }));

import { ticketsService } from "../tickets.service";

const UID = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.ticket.findFirst.mockResolvedValue({ id: "t1", orgId: "orgA", status: "open", priority: "normal", assigneeId: null });
});

describe("a ticket can only be assigned inside its own organization", () => {
  it("rejects an assignee from another organization (or inactive) before writing anything", async () => {
    m.prisma.user.findFirst.mockResolvedValue(null);
    await expect(ticketsService.update("orgA", "t1", { assigneeId: UID })).rejects.toMatchObject({ statusCode: 422 });
    expect(m.prisma.user.findFirst.mock.calls[0]![0].where).toEqual({ id: UID, orgId: "orgA", isActive: true });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects a team from another organization", async () => {
    m.prisma.team.findFirst.mockResolvedValue(null);
    await expect(ticketsService.update("orgA", "t1", { teamId: UID })).rejects.toMatchObject({ statusCode: 422 });
    expect(m.prisma.team.findFirst.mock.calls[0]![0].where).toEqual({ id: UID, orgId: "orgA" });
  });
  it("unassigning (null) needs no lookup", async () => {
    m.prisma.$transaction.mockResolvedValue({ id: "t1", status: "open", assigneeId: null });
    await ticketsService.update("orgA", "t1", { assigneeId: null });
    expect(m.prisma.user.findFirst).not.toHaveBeenCalled();
  });
  it("bulk update reports the failure per ticket instead of assigning", async () => {
    m.prisma.user.findFirst.mockResolvedValue(null);
    const r = await ticketsService.bulkUpdate("orgA", "u", { ticketIds: [UID], assigneeId: UID });
    expect(r[0]).toMatchObject({ success: false });
  });
  it("a deleted customer cannot receive a new ticket", async () => {
    m.prisma.customer.findFirst.mockResolvedValue(null);
    await expect(ticketsService.create("orgA", "u", { customerId: UID, subject: "x", channel: "api", priority: "normal" })).rejects.toMatchObject({ statusCode: 404 });
    expect(m.prisma.customer.findFirst.mock.calls[0]![0].where).toMatchObject({ orgId: "orgA", deletedAt: null });
  });
});
