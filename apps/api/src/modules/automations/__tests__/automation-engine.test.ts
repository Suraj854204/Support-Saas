import type { Ticket } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    automationRule: { findMany: vi.fn(), findFirst: vi.fn() },
    automationRunLog: { create: vi.fn() },
    customer: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    ticket: { update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn() },
    ticketMessage: { create: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    teamMember: { findMany: vi.fn() },
    team: { findFirst: vi.fn() },
  },
  publishEvent: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/kafka", () => ({ publishEvent: m.publishEvent, KAFKA_TOPICS: { TICKET_ASSIGNED: "ticket.assigned" } }));
vi.mock("@/modules/canned-responses/canned-responses.service", () => ({ cannedResponsesService: { getById: vi.fn() } }));
vi.mock("@/modules/email-integrations/gmail-send.service", () => ({ gmailSendService: { sendReply: vi.fn() } }));
vi.mock("@/modules/email-integrations/gmail-thread.service", () => ({ buildReplySubject: vi.fn() }));

import { automationEngine, explainConditions, type Action, type Condition } from "../automation-engine.service";


const NOW = new Date("2026-01-10T12:00:00Z");

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: "t1",
    orgId: "org1",
    number: 7,
    subject: "Refund please",
    status: "open",
    priority: "normal",
    channel: "email",
    customerId: "c1",
    assigneeId: null,
    teamId: null,
    tags: [],
    aiSentiment: "negative",
    createdAt: new Date(NOW.getTime() - 5 * 3600_000),
    ...over,
  } as Ticket;
}

const rule = (id: string, conditions: Condition[], actions: Action[]) => ({ id, conditions, actions });

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.customer.findUnique.mockResolvedValue({ tags: ["beta"], isVip: true, email: "ceo@bigco.com" });
  m.prisma.automationRunLog.create.mockResolvedValue({});
  m.prisma.ticket.update.mockResolvedValue({});
  m.prisma.ticket.findUnique.mockResolvedValue({ tags: ["a", "b"] });
});

describe("new conditions", () => {
  const ctx = (t = ticket()) => ({ ticket: t, customerIsVip: true, customerEmail: "ceo@bigco.com", now: NOW });
  const check = (c: Condition, t?: Ticket) => explainConditions([c], ctx(t))[0]!.matched;

  it("matches VIP customers and email domains (with or without @)", () => {
    expect(check({ field: "customer_vip", operator: "equals", value: "true" })).toBe(true);
    expect(check({ field: "customer_email_domain", operator: "equals", value: "bigco.com" })).toBe(true);
    expect(check({ field: "customer_email_domain", operator: "equals", value: "@bigco.com" })).toBe(true);
    expect(check({ field: "customer_email_domain", operator: "equals", value: "other.com" })).toBe(false);
  });

  it("compares ticket age numerically", () => {
    expect(check({ field: "ticket_age_hours", operator: "gt", value: "4" })).toBe(true);
    expect(check({ field: "ticket_age_hours", operator: "gt", value: "6" })).toBe(false);
    expect(check({ field: "ticket_age_hours", operator: "lt", value: "6" })).toBe(true);
    expect(check({ field: "ticket_age_hours", operator: "gt", value: "abc" })).toBe(false);
  });

  it("matches sentiment, assignment state and not_contains", () => {
    expect(check({ field: "sentiment", operator: "equals", value: "negative" })).toBe(true);
    expect(check({ field: "assignee", operator: "equals", value: "unassigned" })).toBe(true);
    expect(check({ field: "assignee", operator: "equals", value: "unassigned" }, ticket({ assigneeId: "u1" }))).toBe(false);
    expect(check({ field: "subject", operator: "not_contains", value: "invoice" })).toBe(true);
    expect(check({ field: "subject", operator: "not_contains", value: "refund" })).toBe(false);
  });
});

describe("new actions", () => {
  it("assign_agent picks the least-loaded eligible agent and publishes ticket.assigned", async () => {
    m.prisma.automationRule.findMany.mockResolvedValue([rule("r1", [], [{ type: "assign_agent", value: "least_loaded" }])]);
    m.prisma.user.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    m.prisma.ticket.groupBy.mockResolvedValue([
      { assigneeId: "a", _count: { _all: 5 } },
      { assigneeId: "b", _count: { _all: 1 } }, // c has none -> c is lightest
    ]);

    await automationEngine.run("org1", "ticket_created", ticket());

    expect(m.prisma.ticket.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { assigneeId: "c" } });
    expect(m.publishEvent).toHaveBeenCalledWith("ticket.assigned", expect.objectContaining({ ticketId: "t1", assigneeId: "c", previousAssigneeId: null }));
    // Only active agents/admins of THIS org are candidates — never viewers/owners or other orgs.
    expect(m.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org1", isActive: true, role: { in: ["agent", "admin"] } }) })
    );
  });

  it("least_loaded stays inside the ticket's team when the team has members", async () => {
    m.prisma.automationRule.findMany.mockResolvedValue([rule("r1", [], [{ type: "assign_agent", value: "least_loaded" }])]);
    m.prisma.teamMember.findMany.mockResolvedValue([{ userId: "x" }, { userId: "y" }]);
    m.prisma.user.findMany.mockResolvedValue([{ id: "x" }]);
    m.prisma.ticket.groupBy.mockResolvedValue([]);

    await automationEngine.run("org1", "ticket_created", ticket({ teamId: "team1" }));

    expect(m.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["x", "y"] } }) })
    );
  });

  it("assign_agent refuses a user id from another org", async () => {
    m.prisma.automationRule.findMany.mockResolvedValue([rule("r1", [], [{ type: "assign_agent", value: "foreign-user" }])]);
    m.prisma.user.findFirst.mockResolvedValue(null);

    await automationEngine.run("org1", "ticket_created", ticket());

    expect(m.prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "foreign-user", orgId: "org1" }) }));
    expect(m.prisma.ticket.update).not.toHaveBeenCalled();
    const log = (m.prisma.automationRunLog.create.mock.calls[0]?.[0] as { data: { actionsApplied: Record<string, unknown> } }).data;
    expect(log.actionsApplied.assignAgentError).toBeDefined();
  });

  it("set_status stamps resolvedAt for solved and rejects invalid values", async () => {
    m.prisma.automationRule.findMany.mockResolvedValue([
      rule("r1", [], [{ type: "set_status", value: "solved" }, { type: "set_status", value: "bogus" }]),
    ]);

    await automationEngine.run("org1", "ticket_created", ticket());

    expect(m.prisma.ticket.update).toHaveBeenCalledTimes(1);
    const data = (m.prisma.ticket.update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("solved");
    expect(data.resolvedAt).toBeInstanceOf(Date);
  });

  it("add_internal_note writes a system-authored internal note; remove_tag removes only that tag", async () => {
    m.prisma.automationRule.findMany.mockResolvedValue([
      rule("r1", [], [{ type: "add_internal_note", value: "VIP — handle fast" }, { type: "remove_tag", value: "a" }]),
    ]);

    await automationEngine.run("org1", "ticket_created", ticket());

    expect(m.prisma.ticketMessage.create).toHaveBeenCalledWith({
      data: { ticketId: "t1", authorType: "system", authorId: null, body: "VIP — handle fast", isInternalNote: true },
    });
    expect(m.prisma.ticket.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { tags: ["b"] } });
  });
});

describe("rule chain", () => {
  it("stop_processing prevents later rules from running", async () => {
    m.prisma.automationRule.findMany.mockResolvedValue([
      rule("r1", [], [{ type: "add_tag", value: "first" }, { type: "stop_processing", value: "-" }]),
      rule("r2", [], [{ type: "add_tag", value: "second" }]),
    ]);

    await automationEngine.run("org1", "ticket_created", ticket());

    expect(m.prisma.automationRunLog.create).toHaveBeenCalledTimes(1);
    expect(m.prisma.automationRunLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ruleId: "r1" }) }));
  });

  it("without stop_processing every matching rule still runs (existing behaviour)", async () => {
    m.prisma.automationRule.findMany.mockResolvedValue([
      rule("r1", [], [{ type: "add_tag", value: "first" }]),
      rule("r2", [], [{ type: "add_tag", value: "second" }]),
    ]);

    await automationEngine.run("org1", "ticket_created", ticket());

    expect(m.prisma.automationRunLog.create).toHaveBeenCalledTimes(2);
  });

  it("does not load customer data unless a condition needs it", async () => {
    m.prisma.automationRule.findMany.mockResolvedValue([rule("r1", [{ field: "subject", operator: "contains", value: "refund" }], [{ type: "add_tag", value: "x" }])]);

    await automationEngine.run("org1", "ticket_created", ticket());

    expect(m.prisma.customer.findUnique).not.toHaveBeenCalled();
  });
});

describe("simulate", () => {
  it("reports per-condition results and planned actions without changing anything", async () => {
    m.prisma.automationRule.findFirst.mockResolvedValue(
      rule(
        "r1",
        [
          { field: "customer_vip", operator: "equals", value: "true" },
          { field: "subject", operator: "contains", value: "invoice" },
        ],
        [{ type: "set_priority", value: "urgent" }]
      )
    );
    m.prisma.ticket.findFirst.mockResolvedValue(ticket());

    const result = await automationEngine.simulate("org1", "r1", "t1");

    expect(result?.wouldMatch).toBe(false);
    expect(result?.conditions.map((c) => c.matched)).toEqual([true, false]);
    expect(result?.actions).toEqual([]);
    expect(m.prisma.ticket.update).not.toHaveBeenCalled();
    expect(m.prisma.automationRunLog.create).not.toHaveBeenCalled();
  });

  it("returns the actions that would run on a match, and null for another org's rule or ticket", async () => {
    m.prisma.automationRule.findFirst.mockResolvedValue(rule("r1", [], [{ type: "add_tag", value: "x" }]));
    m.prisma.ticket.findFirst.mockResolvedValue(ticket());
    expect((await automationEngine.simulate("org1", "r1", "t1"))?.actions).toEqual([{ type: "add_tag", value: "x" }]);

    m.prisma.ticket.findFirst.mockResolvedValue(null);
    expect(await automationEngine.simulate("org1", "r1", "foreign")).toBeNull();
    expect(m.prisma.ticket.findFirst).toHaveBeenLastCalledWith({ where: { id: "foreign", orgId: "org1" } });
  });
});
