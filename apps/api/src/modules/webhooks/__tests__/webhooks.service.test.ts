import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  webhookEndpoint: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  webhookDelivery: { createMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  ticketMessage: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { toPublicEndpoint, webhooksService } from "../webhooks.service";

import { decryptSecret } from "@/lib/encryption";


const baseEvent = { eventId: "evt1", orgId: "org1", occurredAt: "2026-10-19T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("webhooksService.dispatchFromEvent", () => {
  it("ignores events that are not part of the public catalogue", async () => {
    await webhooksService.dispatchFromEvent("ai.suggestion.ready", baseEvent);

    expect(prismaMock.webhookEndpoint.findMany).not.toHaveBeenCalled();
    expect(prismaMock.webhookDelivery.createMany).not.toHaveBeenCalled();
  });

  it("only looks at active endpoints in the event's own org that subscribe to the type (or to everything)", async () => {
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([]);

    await webhooksService.dispatchFromEvent("ticket.created", { ...baseEvent, ticketId: "t1" } as never);

    expect(prismaMock.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org1",
        isActive: true,
        OR: [{ events: { isEmpty: true } }, { events: { has: "ticket.created" } }],
      },
    });
    expect(prismaMock.webhookDelivery.createMany).not.toHaveBeenCalled();
  });

  it("queues one delivery per matching endpoint, idempotently", async () => {
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep1" }, { id: "ep2" }]);

    await webhooksService.dispatchFromEvent("ticket.created", { ...baseEvent, ticketId: "t1", subject: "Hi" } as never);

    const arg = prismaMock.webhookDelivery.createMany.mock.calls[0]?.[0] as {
      data: Array<{ endpointId: string; eventId: string; payload: { type: string; data: Record<string, unknown> } }>;
      skipDuplicates: boolean;
    };
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data.map((d) => d.endpointId)).toEqual(["ep1", "ep2"]);
    expect(arg.data[0]?.eventId).toBe("evt1");
    expect(arg.data[0]?.payload).toMatchObject({ type: "ticket.created", data: { ticketId: "t1", subject: "Hi" } });
  });

  it("never sends internal notes out of the helpdesk", async () => {
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep1" }]);
    prismaMock.ticketMessage.findUnique.mockResolvedValue({ isInternalNote: true });

    await webhooksService.dispatchFromEvent("message.sent", {
      ...baseEvent,
      ticketId: "t1",
      messageId: "m1",
      authorType: "agent",
      body: "customer is being difficult",
    } as never);

    expect(prismaMock.webhookDelivery.createMany).not.toHaveBeenCalled();
  });

  it("does send public messages", async () => {
    prismaMock.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep1" }]);
    prismaMock.ticketMessage.findUnique.mockResolvedValue({ isInternalNote: false });

    await webhooksService.dispatchFromEvent("message.sent", {
      ...baseEvent,
      ticketId: "t1",
      messageId: "m1",
      authorType: "agent",
      body: "Your refund is on the way",
    } as never);

    expect(prismaMock.webhookDelivery.createMany).toHaveBeenCalledTimes(1);
  });

  it("swallows database errors so a webhook problem can never break ticket handling", async () => {
    prismaMock.webhookEndpoint.findMany.mockRejectedValue(new Error("db down"));

    await expect(
      webhooksService.dispatchFromEvent("ticket.created", { ...baseEvent, ticketId: "t1" } as never)
    ).resolves.toBeUndefined();
  });
});

describe("webhooksService.create", () => {
  it("returns the signing secret once and stores it only encrypted", async () => {
    prismaMock.webhookEndpoint.count.mockResolvedValue(0);
    prismaMock.webhookEndpoint.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ep1",
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      disabledReason: null,
      ...data,
    }));

    const result = await webhooksService.create("org1", "u1", {
      // NODE_ENV=test permits a local receiver
      url: "http://127.0.0.1:9999/hook",
      format: "json",
      events: ["ticket.created"],
    });

    expect(result.secret).toMatch(/^whsec_/);
    expect(result.endpoint).not.toHaveProperty("secretEncrypted");

    const stored = prismaMock.webhookEndpoint.create.mock.calls[0]?.[0] as { data: { secretEncrypted: string; orgId: string } };
    expect(stored.data.orgId).toBe("org1");
    expect(stored.data.secretEncrypted).not.toContain(result.secret);
    expect(decryptSecret(stored.data.secretEncrypted)).toBe(result.secret);
  });

  it("enforces a per-org endpoint limit", async () => {
    prismaMock.webhookEndpoint.count.mockResolvedValue(20);

    await expect(
      webhooksService.create("org1", "u1", { url: "http://127.0.0.1:9999/hook", format: "json", events: [] })
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(prismaMock.webhookEndpoint.create).not.toHaveBeenCalled();
  });
});

describe("tenant isolation", () => {
  it("cannot update, delete or test another org's endpoint", async () => {
    prismaMock.webhookEndpoint.findFirst.mockResolvedValue(null);

    await expect(webhooksService.update("org1", "u1", "foreign", { isActive: false })).rejects.toMatchObject({ statusCode: 404 });
    await expect(webhooksService.remove("org1", "u1", "foreign")).rejects.toMatchObject({ statusCode: 404 });
    await expect(webhooksService.sendTest("org1", "foreign")).rejects.toMatchObject({ statusCode: 404 });

    expect(prismaMock.webhookEndpoint.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", orgId: "org1" } });
    expect(prismaMock.webhookEndpoint.update).not.toHaveBeenCalled();
    expect(prismaMock.webhookEndpoint.delete).not.toHaveBeenCalled();
  });

  it("cannot retry another org's delivery", async () => {
    prismaMock.webhookDelivery.findFirst.mockResolvedValue(null);

    await expect(webhooksService.retryDelivery("org1", "foreign")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.webhookDelivery.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", orgId: "org1" } });
  });
});

describe("toPublicEndpoint", () => {
  it("strips the encrypted secret", () => {
    const out = toPublicEndpoint({ id: "ep1", secretEncrypted: "v1:xx", url: "https://a.example" } as never);
    expect(out).not.toHaveProperty("secretEncrypted");
    expect(out).toMatchObject({ id: "ep1" });
  });
});
