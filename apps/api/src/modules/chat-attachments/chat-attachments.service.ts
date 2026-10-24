import type { Attachment } from "@prisma/client";

import { classifyUpload, maxBytesFor, sanitizeFilename, ALLOWED_TYPES_HINT } from "./file-policy";
import { fileUrl } from "./signed-url";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";
import { chatStorage } from "@/lib/chat-storage";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const MAX_FILES_PER_MESSAGE = 5;
const MAX_PENDING_PER_UPLOADER = 20;
const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;

export interface Uploader {
  type: "customer" | "agent";
  id: string;
}

/** What clients may know about a file. Never includes the storage key or provider. */
export interface AttachmentView {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  url: string;
  downloadUrl: string;
  createdAt: string;
}

export const ATTACHMENT_SELECT = {
  id: true,
  filename: true,
  mimeType: true,
  sizeBytes: true,
  kind: true,
  createdAt: true,
} as const;

type ViewSource = Pick<Attachment, "id" | "filename" | "mimeType" | "sizeBytes" | "kind" | "createdAt">;

export function toView(a: ViewSource): AttachmentView {
  return {
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    kind: a.kind,
    url: fileUrl(a.id),
    downloadUrl: fileUrl(a.id, { download: true }),
    createdAt: a.createdAt.toISOString(),
  };
}

/** Replaces a message's raw attachment rows with client-safe views carrying fresh short-lived links. */
export function presentMessage<T extends { attachments?: ViewSource[] }>(message: T): Omit<T, "attachments"> & { attachments: AttachmentView[] } {
  return { ...message, attachments: (message.attachments ?? []).map(toView) };
}

export const chatAttachmentsService = {
  /**
   * Validates by content, stores privately and records one file for a ticket. The file is "pending" (no message)
   * until its sender posts a message that references it.
   */
  async upload(orgId: string, ticketId: string, uploader: Uploader, file: { buffer: Buffer; originalname: string }): Promise<AttachmentView> {
    const pending = await prisma.attachment.count({ where: { orgId, ticketId, uploaderType: uploader.type, uploaderId: uploader.id, messageId: null } });
    if (pending >= MAX_PENDING_PER_UPLOADER) throw AppError.rateLimited("Too many files waiting to be sent. Send your message first.");

    const accepted = classifyUpload(file.buffer, file.originalname);
    if (!accepted) throw AppError.validation(`This file type isn't allowed. Allowed: ${ALLOWED_TYPES_HINT}.`);
    if (file.buffer.length > maxBytesFor(accepted.kind, { fileMb: env.CHAT_UPLOAD_MAX_MB, videoMb: env.CHAT_UPLOAD_VIDEO_MAX_MB })) {
      const mb = accepted.kind === "video" ? env.CHAT_UPLOAD_VIDEO_MAX_MB : env.CHAT_UPLOAD_MAX_MB;
      throw AppError.validation(`This file is too large. The limit for this type is ${mb} MB.`);
    }

    // The stored name always ends in the extension that matches the real content.
    const clean = sanitizeFilename(file.originalname);
    const dot = clean.lastIndexOf(".");
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const filename = `${stem}${accepted.ext}`;

    const stored = await chatStorage.put(orgId, file.buffer, { kind: accepted.kind, ext: accepted.ext });
    try {
      const row = await prisma.attachment.create({
        data: {
          orgId,
          ticketId,
          filename,
          mimeType: accepted.mime,
          sizeBytes: file.buffer.length,
          storageKey: stored.key,
          provider: stored.provider,
          resourceType: stored.resourceType,
          kind: accepted.kind,
          uploaderType: uploader.type,
          uploaderId: uploader.id,
        },
        select: ATTACHMENT_SELECT,
      });
      return toView(row);
    } catch (err) {
      await chatStorage.remove(stored).catch(() => undefined); // never leave an unreferenced file behind
      throw err;
    }
  },

  /** Attaches the sender's own pending files to a message. Any id that is not theirs, not pending, or on another ticket is refused. */
  async link(orgId: string, ticketId: string, messageId: string, ids: string[], uploader: Uploader): Promise<void> {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    if (unique.length > MAX_FILES_PER_MESSAGE) throw AppError.validation(`You can send up to ${MAX_FILES_PER_MESSAGE} files at once.`);
    const { count } = await prisma.attachment.updateMany({
      where: { id: { in: unique }, orgId, ticketId, uploaderType: uploader.type, uploaderId: uploader.id, messageId: null },
      data: { messageId },
    });
    if (count !== unique.length) throw AppError.validation("One of the attached files is no longer available. Please attach it again.");
  },

  /** Checks BEFORE a message is created, so a bad attachment id never leaves a half-sent message behind. */
  async assertLinkable(orgId: string, ticketId: string, ids: string[], uploader: Uploader): Promise<void> {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    if (unique.length > MAX_FILES_PER_MESSAGE) throw AppError.validation(`You can send up to ${MAX_FILES_PER_MESSAGE} files at once.`);
    const found = await prisma.attachment.count({ where: { id: { in: unique }, orgId, ticketId, uploaderType: uploader.type, uploaderId: uploader.id, messageId: null } });
    if (found !== unique.length) throw AppError.validation("One of the attached files is no longer available. Please attach it again.");
  },

  /** A file for the signed-link route. No org filter: the signature already binds the link to this one file. */
  async getById(id: string) {
    return prisma.attachment.findUnique({ where: { id } });
  },

  /** Removes uploads that were never sent in a message (abandoned drafts). Safe to run often. */
  async sweepOrphans(now = new Date()): Promise<number> {
    const stale = await prisma.attachment.findMany({
      where: { messageId: null, inboundEmailMessageId: null, uploaderType: { in: ["customer", "agent"] }, createdAt: { lt: new Date(now.getTime() - ORPHAN_AFTER_MS) } },
      take: 100,
    });
    let removed = 0;
    for (const a of stale) {
      try {
        await chatStorage.remove({ provider: a.provider as "local" | "cloudinary", key: a.storageKey, resourceType: a.resourceType as "image" | "video" | "raw" });
        await prisma.attachment.delete({ where: { id: a.id } });
        removed++;
      } catch (err) {
        logger.warn({ err, attachmentId: a.id }, "Could not remove an abandoned upload; will retry");
      }
    }
    return removed;
  },
};
