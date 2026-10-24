import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    shopifyConnection: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));

import { normalizeShopDomain, shopifyService } from "../shopify.service";

import { decryptSecret } from "@/lib/encryption";


const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  m.prisma.auditLog.create.mockResolvedValue({});
});
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("normalizeShopDomain", () => {
  it("accepts shop hosts, tolerating scheme/path/case", () => {
    expect(normalizeShopDomain("https://My-Store.myshopify.com/admin")).toBe("my-store.myshopify.com");
  });

  it.each(["evil.com", "x.myshopify.com.evil.com", "127.0.0.1", "myshopify.com", "a b.myshopify.com", "user@evil.com#.myshopify.com"])(
    "rejects %s so the token can never be sent elsewhere",
    (bad) => {
      expect(() => normalizeShopDomain(bad)).toThrow();
    }
  );
});

describe("shopifyService.connect", () => {
  it("verifies the token with Shopify, then stores it encrypted", async () => {
    fetchMock.mockResolvedValue(json({ shop: {} }));
    m.prisma.shopifyConnection.upsert.mockResolvedValue({});

    const res = await shopifyService.connect("org1", "u1", "shop.myshopify.com", "shpat_secret_token");

    expect(res).toEqual({ connected: true, shopDomain: "shop.myshopify.com" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://shop.myshopify.com/admin/api/");
    const stored = (m.prisma.shopifyConnection.upsert.mock.calls[0]?.[0] as { create: { accessTokenEncrypted: string } }).create;
    expect(stored.accessTokenEncrypted).not.toContain("shpat_secret_token");
    expect(decryptSecret(stored.accessTokenEncrypted)).toBe("shpat_secret_token");
  });

  it("stores nothing when Shopify rejects the token", async () => {
    fetchMock.mockResolvedValue(json({}, 401));

    await expect(shopifyService.connect("org1", "u1", "shop.myshopify.com", "bad-token-123")).rejects.toMatchObject({ statusCode: 422 });
    expect(m.prisma.shopifyConnection.upsert).not.toHaveBeenCalled();
  });

  it("does not call Shopify at all for an invalid domain", async () => {
    await expect(shopifyService.connect("org1", "u1", "evil.com", "shpat_secret_token")).rejects.toMatchObject({ statusCode: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("shopifyService.lookupOrders", () => {
  it("returns a trimmed public view of recent orders and uses the org's own connection", async () => {
    const { encryptSecret } = await import("@/lib/encryption");
    m.prisma.shopifyConnection.findUnique.mockResolvedValue({ shopDomain: "shop.myshopify.com", accessTokenEncrypted: encryptSecret("tok_abcdefghij") });
    fetchMock.mockResolvedValue(
      json({
        orders: [
          {
            id: 99,
            name: "#1001",
            created_at: "2024-03-01T00:00:00Z",
            financial_status: "paid",
            fulfillment_status: null,
            cancelled_at: null,
            total_price: "49.00",
            currency: "USD",
            customer: { email: "leak@x.io", phone: "123" },
            line_items: [{ title: "Mug", quantity: 2, price: "10" }],
            fulfillments: [{ tracking_company: "UPS", tracking_number: "1Z", tracking_url: "javascript:alert(1)" }],
          },
        ],
      })
    );

    const orders = await shopifyService.lookupOrders("org1", " Asha@Example.com ");

    expect(m.prisma.shopifyConnection.findUnique).toHaveBeenCalledWith({ where: { orgId: "org1" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("email=asha%40example.com");
    expect((init.headers as Record<string, string>)["X-Shopify-Access-Token"]).toBe("tok_abcdefghij");
    expect(init.redirect).toBe("error");
    expect(orders).toEqual([
      {
        id: "99",
        name: "#1001",
        createdAt: "2024-03-01T00:00:00Z",
        financialStatus: "paid",
        fulfillmentStatus: "unfulfilled",
        cancelled: false,
        total: "49.00",
        currency: "USD",
        items: [{ title: "Mug", quantity: 2 }],
        tracking: [{ company: "UPS", number: "1Z", url: null }], // non-https tracking links dropped
      },
    ]);
    expect(JSON.stringify(orders)).not.toContain("leak@x.io");
  });

  it("404s when Shopify is not connected, and maps network failure to 502", async () => {
    m.prisma.shopifyConnection.findUnique.mockResolvedValue(null);
    await expect(shopifyService.lookupOrders("org1", "a@x.io")).rejects.toMatchObject({ statusCode: 404 });

    const { encryptSecret } = await import("@/lib/encryption");
    m.prisma.shopifyConnection.findUnique.mockResolvedValue({ shopDomain: "shop.myshopify.com", accessTokenEncrypted: encryptSecret("tok_abcdefghij") });
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(shopifyService.lookupOrders("org1", "a@x.io")).rejects.toMatchObject({ statusCode: 502 });
  });
});
