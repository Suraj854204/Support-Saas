import http from "node:http";
import type { AddressInfo } from "node:net";

import type { WebhookDelivery, WebhookEndpoint } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  webhookDelivery: { update: vi.fn() },
  webhookEndpoint: { update: vi.fn() },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));


import { verifySignature } from "../signing";
import { MAX_DELIVERY_ATTEMPTS, attemptDelivery, backoffSeconds } from "../webhook-delivery.service";
import { WEBHOOK_TEST_EVENT } from "../webhook-events";

import { encryptSecret } from "@/lib/encryption";

const SECRET = "whsec_unit_test_secret";

interface Received {
  headers: http.IncomingHttpHeaders;
  body: string;
}

let server: http.Server;
let baseUrl = "";
let received: Received[] = [];
let respondWith = 200;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.statusCode = respondWith;
      res.end(respondWith >= 400 ? "nope" : "ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  respondWith = 200;
  vi.clearAllMocks();
});

function makeDelivery(overrides: Partial<WebhookDelivery> = {}, endpoint: Partial<WebhookEndpoint> = {}) {
  const ep: WebhookEndpoint = {
    id: "ep1",
    orgId: "org1",
    url: baseUrl,
    description: null,
    format: "json",
    events: [],
    secretEncrypted: encryptSecret(SECRET),
    isActive: true,
    disabledReason: null,
    createdById: "u1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...endpoint,
  };
  const delivery: WebhookDelivery & { endpoint: WebhookEndpoint } = {
    id: "del1",
    orgId: "org1",
    endpointId: ep.id,
    eventId: "evt1",
    eventType: "ticket.created",
    payload: { id: "evt1", type: "ticket.created", createdAt: "2026-10-19T00:00:00Z", orgId: "org1", data: { ticketId: "t1" } },
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
    lastError: null,
    lastStatusCode: null,
    deliveredAt: null,
    createdAt: new Date(),
    endpoint: ep,
    ...overrides,
  };
  return delivery;
}

function lastUpdate() {
  const call = prismaMock.webhookDelivery.update.mock.calls.at(-1);
  return (call?.[0] as { data: Record<string, unknown> }).data;
}

describe("backoffSeconds", () => {
  it("grows with each failure and caps", () => {
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(2)).toBe(120);
    expect(backoffSeconds(3)).toBe(600);
    expect(backoffSeconds(7)).toBe(21_600);
    expect(backoffSeconds(50)).toBe(21_600);
  });
});

describe("attemptDelivery", () => {
  it("delivers a correctly signed JSON envelope and marks the delivery delivered", async () => {
    await attemptDelivery(makeDelivery());

    expect(received).toHaveLength(1);
    const req = received[0] as Received;
    expect(JSON.parse(req.body)).toMatchObject({ id: "evt1", type: "ticket.created", data: { ticketId: "t1" } });
    expect(req.headers["x-support-event"]).toBe("ticket.created");
    expect(req.headers["x-support-delivery"]).toBe("del1");
    // The receiver can verify authenticity with the secret it was shown at creation.
    expect(verifySignature(SECRET, req.body, req.headers["x-support-signature"] as string)).toBe(true);

    expect(lastUpdate()).toMatchObject({ status: "delivered", attempts: 1, lastStatusCode: 200, lastError: null });
  });

  it("sends a Slack-formatted body (not the raw envelope) for slack endpoints", async () => {
    await attemptDelivery(makeDelivery({}, { format: "slack" }));

    const body = JSON.parse((received[0] as Received).body) as Record<string, unknown>;
    expect(typeof body.text).toBe("string");
    expect(body).not.toHaveProperty("orgId");
  });

  it("schedules a retry with backoff when the endpoint returns 5xx", async () => {
    respondWith = 500;
    const before = Date.now();

    await attemptDelivery(makeDelivery());

    const data = lastUpdate();
    expect(data.status).toBe("pending");
    expect(data.attempts).toBe(1);
    expect(data.lastStatusCode).toBe(500);
    expect(String(data.lastError)).toContain("HTTP 500");
    expect((data.nextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(before + 29_000);
  });

  it("gives up and marks the delivery dead once the attempt budget is spent", async () => {
    respondWith = 502;

    await attemptDelivery(makeDelivery({ attempts: MAX_DELIVERY_ATTEMPTS - 1 }));

    expect(lastUpdate()).toMatchObject({ status: "dead", attempts: MAX_DELIVERY_ATTEMPTS });
  });

  it("turns the endpoint off and stops retrying on 410 Gone", async () => {
    respondWith = 410;

    await attemptDelivery(makeDelivery());

    expect(lastUpdate()).toMatchObject({ status: "dead" });
    expect(prismaMock.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: "ep1" },
      data: { isActive: false, disabledReason: "Endpoint returned 410 Gone" },
    });
  });

  it("does not queue retries for the one-shot test event", async () => {
    respondWith = 500;

    await attemptDelivery(makeDelivery({ eventType: WEBHOOK_TEST_EVENT }));

    expect(lastUpdate()).toMatchObject({ status: "dead", attempts: 1 });
  });

  it("records a network failure as a retry instead of throwing", async () => {
    await expect(
      attemptDelivery(makeDelivery({}, { url: "http://127.0.0.1:1/unreachable" }))
    ).resolves.toBeUndefined();

    const data = lastUpdate();
    expect(data.status).toBe("pending");
    expect(data.lastStatusCode).toBeNull();
    expect(String(data.lastError).length).toBeGreaterThan(0);
  });

  it("does not call a disabled endpoint", async () => {
    await attemptDelivery(makeDelivery({}, { isActive: false }));

    expect(received).toHaveLength(0);
    expect(lastUpdate()).toMatchObject({ status: "dead", lastError: "Endpoint is disabled" });
  });

  it("does not follow redirects to another host", async () => {
    // A 302 must be treated as a failed delivery, never chased (redirects are an SSRF bounce).
    respondWith = 302;

    await attemptDelivery(makeDelivery());

    expect(received).toHaveLength(1);
    expect(lastUpdate()).toMatchObject({ status: "pending", lastStatusCode: 302 });
  });
});
