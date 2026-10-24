import type { ApiError } from "@support-saas/shared-types";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "@/lib/app-error";
import { logger } from "@/lib/logger";

export function notFoundHandler(req: Request, res: Response) {
  const body: ApiError = {
    success: false,
    error: { code: "NOT_FOUND", message: `Route not found: ${req.method} ${req.originalUrl}` },
  };
  res.status(404).json(body);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, err.message);
    }
    const body: ApiError = {
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    return res.status(err.statusCode).json(body);
  }

  if (err instanceof ZodError) {
    const body: ApiError = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: { issues: err.flatten() },
      },
    };
    return res.status(422).json(body);
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  const body: ApiError = {
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  };
  return res.status(500).json(body);
}
