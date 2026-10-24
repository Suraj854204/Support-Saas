import { describe, expect, it } from "vitest";

import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_TEST_EVENT,
  buildEnvelope,
  formatSlackMessage,
  isWebhookEventType,
} from "../webhook-events";

describe("event catalogue", () => {
  it("only exposes customer-relevant events, never AI or email-failure internals", () => {
    expect(WEBHOOK_EVENT_TYPES).toContain("ticket.created");
    expect(WEBHOOK_EVENT_TYPES).toContain("message.sent");
    expect(isWebhookEventType("ai.suggestion.ready")).toBe(false);
    expect(isWebhookEventType("email.delivery.failed")).toBe(false);
    expect(isWebhookEventType(WEBHOOK_TEST_EVENT)).toBe(false);
  });
});

describe("buildEnvelope", () => {
  it("wraps an internal event in the stable public shape", () => {
    const envelope = buildEnvelope("ticket.created", {
      eventId: "e1",
      orgId: "o1",
      occurredAt: "2026-10-19T00:00:00.000Z",
      ticketId: "t1",
      subject: "Help",
    } as never);

    expect(envelope).toEqual({
      id: "e1",
      type: "ticket.created",
      createdAt: "2026-10-19T00:00:00.000Z",
      orgId: "o1",
      data: { ticketId: "t1", subject: "Help" },
    });
  });
});

describe("formatSlackMessage", () => {
  const base = { id: "e1", createdAt: "x", orgId: "o1" };

  it("summarises a new ticket", () => {
    const { text } = formatSlackMessage({
      ...base,
      type: "ticket.created",
      data: { ticketId: "t1", subject: "Order missing", channel: "api" },
    });
    expect(text).toContain("Order missing");
    expect(text).toContain("api");
  });

  it("escapes Slack control characters so customer text cannot inject links or mentions", () => {
    const { text } = formatSlackMessage({
      ...base,
      type: "message.sent",
      data: { ticketId: "t1", authorType: "customer", body: "<!channel> click <https://evil.example|here> & more" },
    });
    expect(text).not.toContain("<!channel>");
    expect(text).not.toContain("<https://evil.example|here>");
    expect(text).toContain("&lt;!channel&gt;");
    expect(text).toContain("&amp; more");
  });

  it("truncates very long message bodies", () => {
    const { text } = formatSlackMessage({
      ...base,
      type: "message.sent",
      data: { ticketId: "t1", authorType: "customer", body: "a".repeat(5000) },
    });
    expect(text.length).toBeLessThan(400);
  });

  it("handles the test event and unknown types without throwing", () => {
    expect(formatSlackMessage({ ...base, type: WEBHOOK_TEST_EVENT, data: {} }).text).toContain("Test event");
    expect(formatSlackMessage({ ...base, type: "something.else", data: {} }).text).toContain("something.else");
  });
});
