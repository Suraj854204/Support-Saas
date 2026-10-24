import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: { attachment: { create: vi.fn(), findFirst: vi.fn() } },
  storage: { save: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/storage", () => ({ storage: m.storage }));

import { attachmentDisposition, attachmentsService, safeContentType } from "../attachments.service";

beforeEach(() => vi.clearAllMocks());

describe("download headers", () => {
  it("echoes only a well-formed content type", () => {
    expect(safeContentType("Image/PNG")).toBe("image/png");
    expect(safeContentType("text/html; charset=utf-8")).toBe("application/octet-stream");
    expect(safeContentType("text/html\r\nSet-Cookie: x=1")).toBe("application/octet-stream");
    expect(safeContentType("")).toBe("application/octet-stream");
    expect(safeContentType(null)).toBe("application/octet-stream");
  });
  it("cannot be broken out of by quotes, newlines or path characters in the filename", () => {
    const h = attachmentDisposition('a"; filename=evil.exe\r\nX: y/../..\\b.pdf');
    expect(h).not.toMatch(/[\r\n]/);
    expect(h.startsWith("attachment; filename=\"")).toBe(true);
    expect(h.split('filename="')[1]!.split('"')[0]).not.toMatch(/["/\\]/);
  });
  it("keeps a readable UTF-8 name", () => {
    expect(attachmentDisposition("रिपोर्ट 1.pdf")).toContain("filename*=UTF-8''%E0%A4%B0");
  });
});

describe("downloadAndStore", () => {
  const gmail = (bytes: number) =>
    ({ users: { messages: { attachments: { get: vi.fn().mockResolvedValue({ data: { data: Buffer.alloc(bytes, 1).toString("base64url") } }) } } } }) as never;
  const att = { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 10, gmailAttachmentId: "g1", blocked: false };

  it("stores a normal attachment", async () => {
    m.storage.save.mockResolvedValue("o/k.bin");
    await attachmentsService.downloadAndStore(gmail(100), "gm", "o", "t", "ie", [att]);
    expect(m.prisma.attachment.create).toHaveBeenCalledTimes(1);
  });
  it("refuses a file whose real size exceeds the limit even though its metadata claimed 10 bytes", async () => {
    await attachmentsService.downloadAndStore(gmail(10 * 1024 * 1024 + 1), "gm", "o", "t", "ie", [att]);
    expect(m.storage.save).not.toHaveBeenCalled();
    expect(m.prisma.attachment.create).not.toHaveBeenCalled();
  });
  it("looks attachments up inside the caller's organization only", async () => {
    await attachmentsService.getForDownload("orgA", "att1");
    expect(m.prisma.attachment.findFirst.mock.calls[0]![0].where).toEqual({ id: "att1", orgId: "orgA" });
  });
});
