import type { Request, Response } from "express";

import { attachmentsService } from "./attachments.service";

import { AppError } from "@/lib/app-error";
import { storage } from "@/lib/storage";

export const attachmentsController = {
  async download(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();

    const attachment = await attachmentsService.getForDownload(req.auth.orgId, req.params.id as string);
    if (!attachment) throw AppError.notFound("Attachment not found");

    const buffer = await storage.read(attachment.storageKey);

    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
    res.send(buffer);
  },
};
