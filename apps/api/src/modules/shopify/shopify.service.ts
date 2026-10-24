import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const API_VERSION = "2024-10";
const REQUEST_TIMEOUT_MS = 8000;

// Only genuine Shopify shop hosts are ever called with the merchant's token.
// Pinning the host pattern (instead of accepting any URL) removes SSRF and
// token-exfiltration risk: we can't be pointed at an attacker's server.
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;

export function normalizeShopDomain(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!SHOP_DOMAIN_RE.test(cleaned)) {
    throw AppError.validation("Shop domain must look like your-store.myshopify.com");
  }
  return cleaned;
}

interface ShopifyFulfillment {
  tracking_company?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
}

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  total_price: string;
  currency: string;
  line_items?: Array<{ title: string; quantity: number }>;
  fulfillments?: ShopifyFulfillment[];
}

export interface PublicOrder {
  id: string;
  name: string;
  createdAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string;
  cancelled: boolean;
  total: string;
  currency: string;
  items: Array<{ title: string; quantity: number }>;
  tracking: Array<{ company: string | null; number: string | null; url: string | null }>;
}

async function shopifyGet(shopDomain: string, token: string, path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/${path}`, {
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err, shopDomain }, "Shopify request failed");
    throw new AppError("INTERNAL_ERROR", "Could not reach Shopify. Try again shortly.", 502);
  }

  if (response.status === 401 || response.status === 403) {
    throw AppError.validation("Shopify rejected the access token. Check it and the app's read_orders scope.");
  }
  if (response.status === 404) throw AppError.validation("Shopify store not found for that domain");
  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", `Shopify returned an error (${response.status})`, 502);
  }
  return response.json();
}

function toPublicOrder(o: ShopifyOrder): PublicOrder {
  return {
    id: String(o.id),
    name: o.name,
    createdAt: o.created_at,
    financialStatus: o.financial_status,
    fulfillmentStatus: o.fulfillment_status ?? "unfulfilled",
    cancelled: o.cancelled_at !== null,
    total: o.total_price,
    currency: o.currency,
    items: (o.line_items ?? []).map((i) => ({ title: i.title, quantity: i.quantity })),
    tracking: (o.fulfillments ?? []).map((f) => ({
      company: f.tracking_company ?? null,
      number: f.tracking_number ?? null,
      url: f.tracking_url && f.tracking_url.startsWith("https://") ? f.tracking_url : null,
    })),
  };
}

export const shopifyService = {
  /** Connection state only — the token never leaves the server. */
  async getStatus(orgId: string) {
    const conn = await prisma.shopifyConnection.findUnique({ where: { orgId } });
    return conn ? { connected: true as const, shopDomain: conn.shopDomain, connectedAt: conn.createdAt } : { connected: false as const };
  },

  async connect(orgId: string, userId: string, rawDomain: string, accessToken: string) {
    const shopDomain = normalizeShopDomain(rawDomain);
    // Prove the credentials work before storing anything.
    await shopifyGet(shopDomain, accessToken, "shop.json");

    const encrypted = encryptSecret(accessToken);
    await prisma.shopifyConnection.upsert({
      where: { orgId },
      create: { orgId, shopDomain, accessTokenEncrypted: encrypted, createdById: userId },
      update: { shopDomain, accessTokenEncrypted: encrypted },
    });

    await recordAudit({ orgId, actorId: userId, action: "shopify.connected", targetType: "shopify", metadata: { shopDomain } });
    return { connected: true as const, shopDomain };
  },

  async disconnect(orgId: string, userId: string) {
    const { count } = await prisma.shopifyConnection.deleteMany({ where: { orgId } });
    if (count === 0) throw AppError.notFound("Shopify is not connected");
    await recordAudit({ orgId, actorId: userId, action: "shopify.disconnected", targetType: "shopify" });
  },

  /** Recent orders for a customer e-mail, so agents see order status next to the ticket. */
  async lookupOrders(orgId: string, email: string): Promise<PublicOrder[]> {
    const conn = await prisma.shopifyConnection.findUnique({ where: { orgId } });
    if (!conn) throw AppError.notFound("Shopify is not connected");

    const query = new URLSearchParams({ email: email.trim().toLowerCase(), status: "any", limit: "5" });
    const body = (await shopifyGet(conn.shopDomain, decryptSecret(conn.accessTokenEncrypted), `orders.json?${query}`)) as {
      orders?: ShopifyOrder[];
    };
    return (body.orders ?? []).map(toPublicOrder);
  },
};
