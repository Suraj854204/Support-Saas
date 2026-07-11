import { Router } from "express";

import { widgetController } from "./widget.controller";
import { startConversationSchema, widgetMessageSchema } from "./widget.schema";

import { asyncHandler } from "@/lib/async-handler";
import { widgetLimiter } from "@/middleware/rate-limit.middleware";
import { validate } from "@/middleware/validate.middleware";
import { requireWidgetAuth } from "@/middleware/widget-auth.middleware";


export const widgetRouter = Router();

// Public — no staff auth. Rate-limited per IP since any website visitor can call this.
widgetRouter.post(
  "/:orgSlug/conversations",
  widgetLimiter,
  validate({ body: startConversationSchema }),
  asyncHandler(widgetController.startConversation)
);

// Gated by the widget token issued above — never by staff auth.
widgetRouter.get("/conversations/:ticketId", requireWidgetAuth, asyncHandler(widgetController.getConversation));

widgetRouter.post(
  "/conversations/:ticketId/messages",
  requireWidgetAuth,
  validate({ body: widgetMessageSchema }),
  asyncHandler(widgetController.addMessage)
);
