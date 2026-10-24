import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ dir: "" }));
h.dir = fs.mkdtempSync(path.join(os.tmpdir(), "chatstore-"));
vi.mock("@/config/env", () => ({
  env: {
    SECURITY_HASH_SECRET: "test-secret-for-links-1234567890",
    API_PUBLIC_URL: "https://api.test/",
    ATTACHMENT_STORAGE_DIR: h.dir,
    CLOUDINARY_CLOUD_NAME: "",
    CLOUDINARY_API_KEY: "",
    CLOUDINARY_API_SECRET: "",
    CLOUDINARY_FOLDER: "support-desk",
  },
}));

import { fileUrl, verifyFileLink } from "../signed-url";

import { chatStorage, parseRange } from "@/lib/chat-storage";

const parts = (url: string) => {
  const u = new URL(url);
  return { id: u.pathname.split("/").pop()!, e: u.searchParams.get("e"), d: u.searchParams.get("d"), s: u.searchParams.get("s") };
};

describe("signed file links", () => {
  it("verify for the right file before they expire", () => {
    const p = parts(fileUrl("att1"));
    expect(verifyFileLink(p.id, p.e, p.d, p.s)).toEqual({ ok: true, download: false });
    expect(verifyFileLink("att1", ...(Object.values(parts(fileUrl("att1", { download: true }))).slice(1) as [string, string, string]))).toEqual({ ok: true, download: true });
  });
  it("fail for another file, a changed expiry, a flipped download flag, a bad signature or after expiry", () => {
    const p = parts(fileUrl("att1"));
    expect(verifyFileLink("att2", p.e, p.d, p.s).ok).toBe(false);
    expect(verifyFileLink(p.id, Number(p.e) + 3600, p.d, p.s).ok).toBe(false);
    expect(verifyFileLink(p.id, p.e, "1", p.s).ok).toBe(false);
    expect(verifyFileLink(p.id, p.e, p.d, "abc").ok).toBe(false);
    expect(verifyFileLink(p.id, p.e, p.d, undefined).ok).toBe(false);
    expect(verifyFileLink(p.id, p.e, p.d, p.s, Date.now() + 16 * 60 * 1000).ok).toBe(false);
  });
  it("uses the configured public API address", () => {
    expect(fileUrl("a")).toMatch(/^https:\/\/api\.test\/api\/files\/a\?/);
  });
});

describe("parseRange", () => {
  it("understands normal, open-ended and suffix ranges and ignores nonsense", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=0-99999", 1000)).toEqual({ start: 0, end: 999 });
    for (const bad of ["bytes=1000-", "bytes=5-2", "items=0-1", "bytes=0-1,5-6", "bytes=-", undefined]) expect(parseRange(bad as string, 1000)).toBeNull();
  });
});

describe("local chat storage", () => {
  it("round-trips a file, serves a byte range, and removes it", async () => {
    const data = Buffer.from("0123456789".repeat(10));
    const stored = await chatStorage.put("orgA", data, { kind: "image", ext: ".png" });
    expect(stored.provider).toBe("local");
    expect(stored.key.startsWith("chat/orgA/")).toBe(true);
    const read = async (rangeHeader?: string) => {
      const o = await chatStorage.open({ ...stored, size: data.length }, rangeHeader);
      const chunks: Buffer[] = [];
      for await (const c of o.stream) chunks.push(c as Buffer);
      return { body: Buffer.concat(chunks), range: o.range };
    };
    expect((await read()).body.equals(data)).toBe(true);
    const part = await read("bytes=10-19");
    expect(part.body.toString()).toBe("0123456789");
    expect(part.range).toEqual({ start: 10, end: 19 });
    await chatStorage.remove(stored);
    await expect(read()).rejects.toThrow();
  });
  it("refuses a key that tries to leave the storage folder", async () => {
    await expect(chatStorage.open({ provider: "local", key: "../../etc/passwd", resourceType: "raw", size: 1 })).rejects.toThrow(/Invalid storage key/);
  });
});
