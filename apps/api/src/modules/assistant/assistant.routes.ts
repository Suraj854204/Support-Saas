import crypto from "node:crypto";

import type { ApiResponse } from "@support-saas/shared-types";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { assistantService } from "./assistant.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { validate } from "@/middleware/validate.middleware";

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `a:${crypto.createHash("sha256").update(`${req.params.publicKey ?? ""}|${req.ip ?? "unknown"}`).digest("hex").slice(0, 32)}`,
  handler: (_req, _res, next) => next(AppError.rateLimited("You are sending messages too fast. Please wait a moment.")),
});

const chatBody = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(["visitor", "assistant"]), text: z.string().trim().min(1).max(1500) }))
    .max(20)
    .default([]),
});

export const publicAssistantRouter = Router();
const originOf = (req: Request) => (typeof req.headers.origin === "string" ? req.headers.origin : undefined);

publicAssistantRouter.get(
  "/:publicKey/config",
  chatLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await assistantService.config(req.params.publicKey as string, originOf(req));
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);

publicAssistantRouter.post(
  "/:publicKey/chat",
  chatLimiter,
  validate({ body: chatBody }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await assistantService.chat(req.params.publicKey as string, originOf(req), req.body);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  })
);
