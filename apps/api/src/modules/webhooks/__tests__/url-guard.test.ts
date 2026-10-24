import { describe, expect, it, vi } from "vitest";

// url-guard behaves differently outside production (private targets allowed
// for local development), so these tests pin the production behaviour.
vi.mock("@/config/env", () => ({ env: { NODE_ENV: "production" } }));

import { assertSafeWebhookUrl, guardedLookup, isBlockedIp } from "../url-guard";

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata service
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:7f00:1", // same, hex form
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1", // NAT64 wrapping loopback
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"])("allows public address %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it("treats a non-IP string as blocked rather than safe", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
});

describe("assertSafeWebhookUrl (production)", () => {
  it("accepts an https URL on a public IP", async () => {
    await expect(assertSafeWebhookUrl("https://8.8.8.8/hooks/support")).resolves.toBeInstanceOf(URL);
  });

  it.each([
    ["plain http", "http://8.8.8.8/hook"],
    ["embedded credentials", "https://user:pass@8.8.8.8/hook"],
    ["localhost", "https://localhost/hook"],
    ["a .internal hostname", "https://db.internal/hook"],
    ["cloud metadata IP", "https://169.254.169.254/latest/meta-data"],
    ["private IPv4", "https://10.0.0.5/hook"],
    ["IPv6 loopback", "https://[::1]/hook"],
    ["IPv4-mapped IPv6 loopback", "https://[::ffff:127.0.0.1]/hook"],
    ["a malformed URL", "not a url"],
    ["a non-http scheme", "ftp://8.8.8.8/hook"],
  ])("rejects %s", async (_label, url) => {
    await expect(assertSafeWebhookUrl(url)).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("guardedLookup (production)", () => {
  it("refuses to connect to a hostname that resolves to a loopback address", async () => {
    const result = await new Promise<{ err: NodeJS.ErrnoException | null }>((resolve) => {
      guardedLookup("localhost", {}, (err) => resolve({ err }));
    });

    expect(result.err?.code).toBe("EBLOCKEDADDR");
  });
});
