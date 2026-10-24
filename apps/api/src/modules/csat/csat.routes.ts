import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { csatService } from "./csat.service";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validate.middleware";

export const csatRouter = Router();

csatRouter.use(requireAuth);

csatRouter.get(
  "/summary",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const days = Number(req.query.days ?? 30);
    res.json({ success: true, data: await csatService.summary(req.auth!.orgId, days) });
  })
);
