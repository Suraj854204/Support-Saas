import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: { attachment: { count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), delete: vi.fn() } },
  storage: { put: vi.fn(), remove: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/chat-storage", () => ({ chatStorage: m.storage }));

import { chatAttachmentsService } from "../chat-attachments.service";

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
const me = { type: "customer" as const, id: "c1" };

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.attachment.count.mockResolvedValue(0);
  m.storage.remove.mockResolvedValue(undefined);
  m.storage.put.mockResolvedValue({ provider: "local", key: "chat/o/x.bin", resourceType: "raw" });
  m.prisma.attachment.create.mockResolvedValue({ id: "a1", filename: "s.png", mimeType: "image/png", sizeBytes: 58, kind: "image", createdAt: new Date() });
});

describe("upload", () => {
  it("stores the file and records who sent it, scoped to the ticket's organization", async () => {
    const v = await chatAttachmentsService.upload("orgA", "t1", me, { buffer: png, originalname: "s.png" });
    expect(v.id).toBe("a1");
    expect(m.prisma.attachment.create.mock.calls[0]![0].data).toMatchObject({ orgId: "orgA", ticketId: "t1", uploaderType: "customer", uploaderId: "c1", kind: "image", mimeType: "image/png" });
  });
  it("renames to the real extension", async () => {
    await chatAttachmentsService.upload("o", "t", me, { buffer: png, originalname: "holiday.pdf" });
    expect(m.prisma.attachment.create.mock.calls[0]![0].data.filename).toBe("holiday.png");
  });
  it("caps files waiting to be sent, before touching storage", async () => {
    m.prisma.attachment.count.mockResolvedValue(20);
    await expect(chatAttachmentsService.upload("o", "t", me, { buffer: png, originalname: "s.png" })).rejects.toMatchObject({ statusCode: 429 });
    expect(m.storage.put).not.toHaveBeenCalled();
  });
  it("refuses disallowed types without storing anything", async () => {
    await expect(chatAttachmentsService.upload("o", "t", me, { buffer: Buffer.from("MZ....."), originalname: "a.png" })).rejects.toMatchObject({ statusCode: 422 });
    expect(m.storage.put).not.toHaveBeenCalled();
  });
  it("removes the stored file again if recording it fails", async () => {
    m.prisma.attachment.create.mockRejectedValue(new Error("db down"));
    await expect(chatAttachmentsService.upload("o", "t", me, { buffer: png, originalname: "s.png" })).rejects.toThrow("db down");
    expect(m.storage.remove).toHaveBeenCalledTimes(1);
  });
});

describe("linking files to a message", () => {
  it("only the sender's own, still-pending files on this ticket may be attached", async () => {
    m.prisma.attachment.updateMany.mockResolvedValue({ count: 1 });
    await chatAttachmentsService.link("orgA", "t1", "msg1", ["a1"], me);
    expect(m.prisma.attachment.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: { in: ["a1"] }, orgId: "orgA", ticketId: "t1", uploaderType: "customer", uploaderId: "c1", messageId: null },
      data: { messageId: "msg1" },
    });
  });
  it("refuses someone else's, already-sent or other-ticket files", async () => {
    m.prisma.attachment.updateMany.mockResolvedValue({ count: 0 });
    await expect(chatAttachmentsService.link("o", "t", "m", ["a1"], me)).rejects.toMatchObject({ statusCode: 422 });
    m.prisma.attachment.count.mockResolvedValue(0);
    await expect(chatAttachmentsService.assertLinkable("o", "t", ["a1"], me)).rejects.toMatchObject({ statusCode: 422 });
  });
  it("allows at most 5 files per message", async () => {
    const ids = ["1", "2", "3", "4", "5", "6"];
    await expect(chatAttachmentsService.assertLinkable("o", "t", ids, me)).rejects.toMatchObject({ statusCode: 422 });
  });
  it("needs nothing when there are no files", async () => {
    await expect(chatAttachmentsService.assertLinkable("o", "t", [], me)).resolves.toBeUndefined();
    await expect(chatAttachmentsService.link("o", "t", "m", [], me)).resolves.toBeUndefined();
    expect(m.prisma.attachment.count).not.toHaveBeenCalled();
  });
});

describe("abandoned uploads", () => {
  it("are removed from storage and the database after a day, but never email attachments or sent files", async () => {
    m.prisma.attachment.findMany.mockResolvedValue([{ id: "old", provider: "local", storageKey: "k", resourceType: "raw" }]);
    expect(await chatAttachmentsService.sweepOrphans(new Date("2026-10-24T00:00:00Z"))).toBe(1);
    const where = m.prisma.attachment.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ messageId: null, inboundEmailMessageId: null });
    expect(where.createdAt.lt).toEqual(new Date("2026-10-23T00:00:00Z"));
    expect(m.storage.remove).toHaveBeenCalled();
    expect(m.prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: "old" } });
  });
});
