import type { Request, Response } from "express";

import { attachmentDisposition, attachmentsService, safeContentType } from "./attachments.service";

import { AppError } from "@/lib/app-error";
import { storage } from "@/lib/storage";

export const attachmentsController = {
  async download(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();

    const attachment = await attachmentsService.getForDownload(req.auth.orgId, req.params.id as string);
    if (!attachment) throw AppError.notFound("Attachment not found");

    const buffer = await storage.read(attachment.storageKey);

    res.setHeader("Content-Type", safeContentType(attachment.mimeType));
    res.setHeader("Content-Disposition", attachmentDisposition(attachment.filename));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.send(buffer);
  },
};
