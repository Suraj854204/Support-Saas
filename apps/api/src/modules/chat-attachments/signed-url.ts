import crypto from "node:crypto";

import { env } from "@/config/env";

/**
 * Short-lived, tamper-proof links to one file. They let <img>, <video> and <a> work (browsers cannot attach an
 * Authorization header to those), and stop working after `ttlSeconds`. Anyone holding a live link can fetch that one
 * file, so links are only ever handed to people who may already see it, and are never stored.
 */
const sign = (id: string, exp: number, dl: boolean) =>
  crypto.createHmac("sha256", env.SECURITY_HASH_SECRET).update(`file:${id}:${exp}:${dl ? 1 : 0}`).digest("base64url");

export function fileUrl(attachmentId: string, opts: { download?: boolean; ttlSeconds?: number; now?: number } = {}): string {
  const exp = Math.floor((opts.now ?? Date.now()) / 1000) + (opts.ttlSeconds ?? 15 * 60);
  const dl = Boolean(opts.download);
  return `${env.API_PUBLIC_URL.replace(/\/$/, "")}/api/files/${attachmentId}?e=${exp}&d=${dl ? 1 : 0}&s=${sign(attachmentId, exp, dl)}`;
}

export function verifyFileLink(attachmentId: string, e: unknown, d: unknown, s: unknown, now = Date.now()): { ok: boolean; download: boolean } {
  const exp = Number(e);
  const dl = d === "1";
  if (!Number.isInteger(exp) || typeof s !== "string" || exp * 1000 < now) return { ok: false, download: false };
  const expected = Buffer.from(sign(attachmentId, exp, dl));
  const given = Buffer.from(s);
  const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  return { ok, download: dl };
}
