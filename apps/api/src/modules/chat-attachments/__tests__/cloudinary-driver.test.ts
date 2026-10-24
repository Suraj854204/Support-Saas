import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  upload_stream: vi.fn(),
  destroy: vi.fn(),
  url: vi.fn(),
  config: vi.fn(),
}));
vi.mock("cloudinary", () => ({ v2: { config: m.config, url: m.url, uploader: { upload_stream: m.upload_stream, destroy: m.destroy } } }));
vi.mock("@/config/env", () => ({
  env: {
    CLOUDINARY_CLOUD_NAME: "demo",
    CLOUDINARY_API_KEY: "key",
    CLOUDINARY_API_SECRET: "secret",
    CLOUDINARY_FOLDER: "support-desk",
    ATTACHMENT_STORAGE_DIR: "/tmp/x",
  },
}));

import { chatStorage } from "@/lib/chat-storage";

beforeEach(() => {
  vi.clearAllMocks();
  m.upload_stream.mockImplementation((_opts: unknown, cb: (e: unknown) => void) => ({ end: () => cb(null) }));
});

describe("Cloudinary driver", () => {
  it("is selected when all three credentials are set", () => {
    expect(chatStorage.provider()).toBe("cloudinary");
  });
  it("uploads privately (authenticated type), inside the org's folder, with a generated name", async () => {
    const r = await chatStorage.put("orgA", Buffer.from("x"), { kind: "image", ext: ".png" });
    const opts = m.upload_stream.mock.calls[0]![0];
    expect(opts).toMatchObject({ type: "authenticated", resource_type: "image", overwrite: false, use_filename: false });
    expect(opts.public_id).toMatch(/^support-desk\/orgA\/[0-9a-f-]{36}$/);
    expect(r).toMatchObject({ provider: "cloudinary", resourceType: "image" });
  });
  it("keeps the extension for raw files and treats audio as video resources", async () => {
    const doc = await chatStorage.put("orgA", Buffer.from("x"), { kind: "document", ext: ".pdf" });
    expect(doc.key.endsWith(".pdf")).toBe(true);
    expect(doc.resourceType).toBe("raw");
    expect((await chatStorage.put("orgA", Buffer.from("x"), { kind: "audio", ext: ".mp3" })).resourceType).toBe("video");
  });
  it("surfaces an upload failure instead of pretending it worked", async () => {
    m.upload_stream.mockImplementation((_o: unknown, cb: (e: unknown) => void) => ({ end: () => cb(new Error("quota")) }));
    await expect(chatStorage.put("orgA", Buffer.from("x"), { kind: "image", ext: ".png" })).rejects.toThrow("quota");
  });
  it("reads through a server-side signed URL and forwards the Range header", async () => {
    m.url.mockReturnValue("https://res.cloudinary.com/demo/image/authenticated/s--sig--/support-desk/orgA/id");
    const fetchMock = vi.fn().mockResolvedValue(new Response("abc", { status: 206 }));
    vi.stubGlobal("fetch", fetchMock);
    const o = await chatStorage.open({ provider: "cloudinary", key: "support-desk/orgA/id", resourceType: "image", size: 100 }, "bytes=0-2");
    expect(m.url.mock.calls[0]![1]).toMatchObject({ type: "authenticated", sign_url: true, secure: true, resource_type: "image" });
    expect(fetchMock.mock.calls[0]![1]).toEqual({ headers: { Range: "bytes=0-2" } });
    expect(o.range).toEqual({ start: 0, end: 2 });
    vi.unstubAllGlobals();
  });
  it("deletes the stored asset and invalidates its CDN copy", async () => {
    m.destroy.mockResolvedValue({ result: "ok" });
    await chatStorage.remove({ provider: "cloudinary", key: "support-desk/orgA/id", resourceType: "image" });
    expect(m.destroy).toHaveBeenCalledWith("support-desk/orgA/id", { resource_type: "image", type: "authenticated", invalidate: true });
  });
});
