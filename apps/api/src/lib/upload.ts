import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";

/**
 * One file per request, held in memory only up to the largest allowed size (the per-type limit is enforced after the
 * content is identified). Multer's own errors are turned into friendly validation errors.
 */
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(env.CHAT_UPLOAD_MAX_MB, env.CHAT_UPLOAD_VIDEO_MAX_MB) * 1024 * 1024, files: 1, fields: 2, parts: 4 },
});

export function singleFileUpload(field = "file") {
  const handler = uploader.single(field);
  return (req: Request, res: Response, next: NextFunction) =>
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") return next(AppError.validation("This file is too large."));
        return next(AppError.validation("The upload could not be read. Send one file at a time."));
      }
      return next(err);
    });
}
