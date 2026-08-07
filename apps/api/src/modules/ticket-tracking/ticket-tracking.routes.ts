import { Router } from "express";

import { ticketTrackingController } from "./ticket-tracking.controller";
import { submitTrackingReplySchema, trackingTokenParamSchema } from "./ticket-tracking.schema";

import { asyncHandler } from "@/lib/async-handler";
import { widgetLimiter } from "@/middleware/rate-limit.middleware";
import { validate } from "@/middleware/validate.middleware";

export const ticketTrackingRouter = Router();

ticketTrackingRouter.get(
  "/:token",
  widgetLimiter,
  validate({ params: trackingTokenParamSchema }),
  asyncHandler(ticketTrackingController.getByToken)
);

ticketTrackingRouter.post(
  "/:token/reply",
  widgetLimiter,
  validate({ params: trackingTokenParamSchema, body: submitTrackingReplySchema }),
  asyncHandler(ticketTrackingController.submitReply)
);
