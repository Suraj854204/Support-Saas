import { describe, expect, it } from "vitest";

import { signPayload, verifySignature } from "../signing";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ id: "evt_1", type: "ticket.created" });

describe("webhook signing", () => {
  it("produces a header a receiver can verify", () => {
    const { header } = signPayload(SECRET, BODY);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifySignature(SECRET, BODY, header)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const { header } = signPayload(SECRET, BODY);
    expect(verifySignature(SECRET, BODY.replace("ticket.created", "ticket.deleted"), header)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const { header } = signPayload(SECRET, BODY);
    expect(verifySignature("whsec_other", BODY, header)).toBe(false);
  });

  it("rejects a replayed request outside the tolerance window", () => {
    const { header } = signPayload(SECRET, BODY, 1_000_000);
    expect(verifySignature(SECRET, BODY, header, 300, 1_000_000 + 301)).toBe(false);
    expect(verifySignature(SECRET, BODY, header, 300, 1_000_000 + 299)).toBe(true);
  });

  it("rejects a timestamp that was swapped after signing", () => {
    const { header } = signPayload(SECRET, BODY, 1_000_000);
    const forged = header.replace("t=1000000", "t=1000100");
    expect(verifySignature(SECRET, BODY, forged, 300, 1_000_100)).toBe(false);
  });

  it("rejects malformed headers without throwing", () => {
    expect(verifySignature(SECRET, BODY, "garbage")).toBe(false);
    expect(verifySignature(SECRET, BODY, "t=abc,v1=")).toBe(false);
    expect(verifySignature(SECRET, BODY, "")).toBe(false);
  });
});
