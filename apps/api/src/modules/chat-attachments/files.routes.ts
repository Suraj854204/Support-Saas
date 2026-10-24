import type { Request, Response } from "express";
import { Router } from "express";

import { chatAttachmentsService } from "./chat-attachments.service";
import { verifyFileLink } from "./signed-url";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { chatStorage } from "@/lib/chat-storage";

export const filesRouter = Router();

const INLINE_KINDS = new Set(["image", "video", "audio"]);

/** Signed, expiring link to one chat file. Streams from private storage with HTTP Range support (video seeking). */
filesRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const link = verifyFileLink(id, req.query.e, req.query.d, req.query.s);
    // One generic answer for a bad, expired or tampered link and for a missing file.
    if (!link.ok) throw AppError.notFound("This link is invalid or has expired.");
    const att = await chatAttachmentsService.getById(id);
    if (!att) throw AppError.notFound("This link is invalid or has expired.");

    const opened = await chatStorage.open(
      { provider: att.provider as "local" | "cloudinary", key: att.storageKey, resourceType: att.resourceType as "image" | "video" | "raw", size: att.sizeBytes },
      req.headers.range
    );

    const inline = !link.download && INLINE_KINDS.has(att.kind);
    const ascii = att.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    res.status(opened.range ? 206 : 200);
    res.setHeader("Content-Type", att.mimeType);
    res.setHeader("Accept-Ranges", "bytes");
    if (opened.range) {
      res.setHeader("Content-Range", `bytes ${opened.range.start}-${opened.range.end}/${opened.size}`);
      res.setHeader("Content-Length", String(opened.range.end - opened.range.start + 1));
    } else {
      res.setHeader("Content-Length", String(opened.size));
    }
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    // The chat widget runs on customers' own websites, so these files must be embeddable cross-origin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "private, max-age=300");
    opened.stream.on("error", () => res.destroy());
    opened.stream.pipe(res);
  })
);
