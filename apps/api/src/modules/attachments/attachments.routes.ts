import { Router } from "express";

import { attachmentsController } from "./attachments.controller";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";

export const attachmentsRouter = Router();

attachmentsRouter.use(requireAuth);

attachmentsRouter.get("/:id/download", asyncHandler(attachmentsController.download));
