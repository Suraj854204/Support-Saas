import dns from "node:dns";
import net from "node:net";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";

/**
 * SSRF protection for customer-supplied webhook URLs.
 *
 * A webhook endpoint makes *our* servers send requests to an address the
 * customer chose, so without a guard it could be pointed at the cloud
 * metadata service (169.254.169.254), the database, Redis, or any other
 * internal host. Two layers:
 *
 *  1. `assertSafeWebhookUrl` — checked when an endpoint is created/updated,
 *     for a fast, readable validation error.
 *  2. `guardedLookup` — plugged into the HTTP client as the DNS `lookup`
 *     function, so the address that is actually connected to is the one that
 *     was validated. This closes the DNS-rebinding gap (a hostname that
 *     resolved to a public IP at creation time but to 10.x.x.x at delivery).
 *
 * Private ranges are allowed outside production so developers can point a
 * webhook at a local receiver.
 */

const blockList = new net.BlockList();

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, includes cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

const BLOCKED_V6: Array<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["2001:db8::", 32], // documentation
];

for (const [addr, prefix] of BLOCKED_V4) blockList.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of BLOCKED_V6) blockList.addSubnet(addr, prefix, "ipv6");

/** Extracts the embedded IPv4 from IPv4-mapped (::ffff:a.b.c.d / ::ffff:7f00:1) and NAT64 (64:ff9b::/96) addresses. */
function embeddedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();

  const dotted = /^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted?.[1]) return dotted[1];

  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex?.[1] && hex[2]) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }

  return null;
}

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 0) return true; // not an IP at all — never treat as safe

  if (version === 6) {
    const v4 = embeddedIpv4(ip);
    if (v4) return isBlockedIp(v4);
    return blockList.check(ip, "ipv6");
  }

  return blockList.check(ip, "ipv4");
}

function privateTargetsAllowed(): boolean {
  return env.NODE_ENV !== "production";
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal");
}

/** Syntactic + DNS validation used when a webhook endpoint is created or its URL changes. */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw AppError.validation("Webhook URL is not a valid URL");
  }

  const allowPrivate = privateTargetsAllowed();

  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    throw AppError.validation("Webhook URL must use https");
  }
  if (url.username || url.password) {
    throw AppError.validation("Webhook URL must not contain credentials");
  }

  if (allowPrivate) return url;

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isLocalHostname(hostname)) {
    throw AppError.validation("Webhook URL must point to a public host");
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw AppError.validation("Webhook URL must point to a public host");
    return url;
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw AppError.validation("Webhook URL host could not be resolved");
  }

  if (addresses.length === 0 || addresses.some((a) => isBlockedIp(a.address))) {
    throw AppError.validation("Webhook URL must point to a public host");
  }

  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

/**
 * DNS `lookup` replacement for http(s).request. Resolves the hostname itself,
 * refuses to connect when any returned address is internal, and hands the
 * validated address list back to the socket.
 */
export function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback
): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);

    const list = addresses as dns.LookupAddress[];

    if (!privateTargetsAllowed() && list.some((a) => isBlockedIp(a.address))) {
      const blocked: NodeJS.ErrnoException = new Error("Blocked: webhook target resolves to a non-public address");
      blocked.code = "EBLOCKEDADDR";
      return callback(blocked);
    }

    const first = list[0];
    if (!first) {
      const empty: NodeJS.ErrnoException = new Error("No addresses found for webhook host");
      empty.code = "ENOTFOUND";
      return callback(empty);
    }

    // Node's net layer asks for `all: true` when happy-eyeballs is on, and
    // for a single address otherwise — answer in whichever shape was asked.
    if (options.all) return callback(null, list);
    return callback(null, first.address, first.family);
  });
}
