import crypto from "node:crypto";

/**
 * Webhook request signing, in the same shape as Stripe's so customers can
 * reuse familiar verification code:
 *
 *   X-Support-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 *
 * The timestamp is part of the signed string so a captured request can't be
 * replayed later; receivers should reject timestamps older than a few minutes.
 */

export function signPayload(
  secret: string,
  body: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): { header: string; timestamp: number } {
  const digest = crypto.createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return { header: `t=${timestampSeconds},v1=${digest}`, timestamp: timestampSeconds };
}

export function verifySignature(
  secret: string,
  body: string,
  header: string,
  toleranceSeconds = 300,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    })
  ) as Record<string, string>;

  const t = Number(parts.t);
  const provided = parts.v1;
  if (!Number.isFinite(t) || !provided) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
