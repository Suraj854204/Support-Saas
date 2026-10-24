import type { AddressInfo } from "net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ dir: "", rows: new Map<string, Record<string, unknown>>() }));
h.dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-http-"));

vi.mock("@/config/env", async (orig) => {
  const real = (await orig()) as { env: Record<string, unknown> };
  return { ...real, env: { ...real.env, ATTACHMENT_STORAGE_DIR: h.dir, CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "", CHAT_UPLOAD_MAX_MB: 1, CHAT_UPLOAD_VIDEO_MAX_MB: 2, API_PUBLIC_URL: "" } };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: { findFirst: vi.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" }) },
    attachment: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `att-${h.rows.size + 1}`, createdAt: new Date(), ...data };
        h.rows.set(row.id as string, row);
        return row;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => h.rows.get(where.id) ?? null),
    },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), on: vi.fn() } }));
vi.mock("@/lib/kafka", () => ({ KAFKA_TOPICS: {}, publishEvent: vi.fn(), connectProducer: vi.fn(), disconnectProducer: vi.fn() }));

import { createApp } from "@/app";
import { signAccessToken, signWidgetToken } from "@/lib/jwt";

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(() => r(undefined))));

const T = "11111111-1111-4111-8111-111111111111";
const agent = (role: "viewer" | "agent") => `Bearer ${signAccessToken({ sub: "u1", orgId: "org1", role, emailVerified: true } as never)}`;
const visitor = () => `Bearer ${signWidgetToken({ sub: "cust1", orgId: "org1" })}`;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 7)]);

const upload = (url: string, auth: string, data: Buffer, name: string) => {
  const form = new FormData();
  form.append("file", new Blob([data]), name);
  return fetch(`${base}${url}`, { method: "POST", headers: { authorization: auth }, body: form });
};

describe("agent uploads", () => {
  it("a viewer cannot upload", async () => {
    expect((await upload(`/api/tickets/${T}/attachments`, agent("viewer"), png, "a.png")).status).toBe(403);
  });
  it("an agent uploads a screenshot and gets a safe view (no storage details)", async () => {
    const res = await upload(`/api/tickets/${T}/attachments`, agent("agent"), png, "Screenshot.png");
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: Record<string, string> };
    expect(data).toMatchObject({ filename: "Screenshot.png", mimeType: "image/png", kind: "image", sizeBytes: png.length });
    expect(JSON.stringify(data)).not.toMatch(/storageKey|provider|chat\//);
    expect(data.url).toMatch(/^\/api\/files\/att-\d+\?e=\d+&d=0&s=/);
  });
  it("a program renamed to .png is refused", async () => {
    const exe = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0]), Buffer.alloc(100)]);
    const res = await upload(`/api/tickets/${T}/attachments`, agent("agent"), exe, "photo.png");
    expect(res.status).toBe(422);
  });
  it("a file over the size limit is refused", async () => {
    const big = Buffer.concat([png, Buffer.alloc(1.5 * 1024 * 1024)]); // limit for images is 1 MB in this test
    expect((await upload(`/api/tickets/${T}/attachments`, agent("agent"), big, "big.png")).status).toBe(422);
  });
  it("no file at all is a clear validation error", async () => {
    const res = await fetch(`${base}/api/tickets/${T}/attachments`, { method: "POST", headers: { authorization: agent("agent") }, body: new FormData() });
    expect(res.status).toBe(422);
  });
});

describe("visitor uploads", () => {
  it("need a widget session", async () => {
    const form = new FormData();
    form.append("file", new Blob([png]), "a.png");
    expect((await fetch(`${base}/api/widget/conversations/${T}/attachments`, { method: "POST", body: form })).status).toBe(401);
  });
  it("a visitor uploads into their own conversation", async () => {
    const res = await upload(`/api/widget/conversations/${T}/attachments`, visitor(), png, "problem.png");
    expect(res.status).toBe(201);
  });
});

describe("signed file links", () => {
  it("serve the file inline with safe headers, support Range, and refuse tampering", async () => {
    const { data } = (await (await upload(`/api/tickets/${T}/attachments`, agent("agent"), png, "shot.png")).json()) as { data: Record<string, string> };

    const ok = await fetch(`${base}${data.url}`);
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer()).equals(png)).toBe(true);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ok.headers.get("content-security-policy")).toContain("sandbox");
    expect(ok.headers.get("cross-origin-resource-policy")).toBe("cross-origin");

    const part = await fetch(`${base}${data.url}`, { headers: { range: "bytes=0-9" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-9/${png.length}`);
    expect((await part.arrayBuffer()).byteLength).toBe(10);

    const dl = await fetch(`${base}${data.downloadUrl}`);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);

    expect((await fetch(`${base}${data.url!.replace(/s=./, "s=x")}`)).status).toBe(404);
    expect((await fetch(`${base}${data.url!.replace("d=0", "d=1")}`)).status).toBe(404); // flag is part of the signature
    expect((await fetch(`${base}/api/files/att-1?e=1&d=0&s=abc`)).status).toBe(404);
  });
  it("documents are never shown inline", async () => {
    const pdf = Buffer.from("%PDF-1.7\n" + "x".repeat(300));
    const { data } = (await (await upload(`/api/tickets/${T}/attachments`, agent("agent"), pdf, "contract.pdf")).json()) as { data: Record<string, string> };
    const res = await fetch(`${base}${data.url}`);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });
});
