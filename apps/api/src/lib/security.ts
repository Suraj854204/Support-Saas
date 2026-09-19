import crypto from "node:crypto";

import { env } from "@/config/env";

/**
 * Shared security primitives for anything that needs "generate a secret,
 * show it to the user once, store only a hash" — login OTPs, email
 * verification links, invitation links, trusted-device tokens, and (later)
 * public ticket-tracking tokens.
 *
 * All hashes are HMAC-SHA256 keyed by SECURITY_HASH_SECRET rather than plain
 * SHA-256, so a stolen database dump alone is not enough to precompute a
 * rainbow table against these values.
 */

function hmac(value: string): string {
  return crypto.createHmac("sha256", env.SECURITY_HASH_SECRET).update(value).digest("hex");
}

/** Generates a cryptographically secure 6-digit numeric OTP (000000–999999). */
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(otp: string): string {
  return hmac(`otp:${otp}`);
}

/** Generates a URL-safe random token with at least `bytes` bytes of entropy. */
export function generateRawToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return hmac(`token:${token}`);
}

/** Public, non-guessable identifiers (e.g. OTP challengeId) — not secret, so no HMAC needed. */
export function generatePublicId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Short alphanumeric token embedded in a plus-addressed Reply-To
 * (e.g. support+k3f9a1@example.com) — Feature 8's "internal ticket reply
 * token" thread-matching fallback. Deliberately hex, not base64url: some
 * mail clients/gateways mangle `-`/`_` in a local-part.
 */
export function generateReplyToken(): string {
  return crypto.randomBytes(5).toString("hex");
}

/** Constant-time string equality to avoid timing side-channels on hash comparisons. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to keep timing roughly constant.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Masks an email for display without revealing the full local part, e.g. "a***@example.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
