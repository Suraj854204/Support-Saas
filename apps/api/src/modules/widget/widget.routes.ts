import { Router } from "express";

import { widgetController } from "./widget.controller";
import { callRequestSchema, startConversationSchema, widgetMessageSchema } from "./widget.schema";

import { asyncHandler } from "@/lib/async-handler";
import { singleFileUpload } from "@/lib/upload";
import { uploadLimiter, widgetLimiter } from "@/middleware/rate-limit.middleware";
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

widgetRouter.post("/conversations/:ticketId/human", requireWidgetAuth, asyncHandler(widgetController.requestHuman));

// A visitor can upload files to their own conversation only (the token binds customer and organization).
widgetRouter.post(
  "/conversations/:ticketId/attachments",
  requireWidgetAuth,
  uploadLimiter,
  singleFileUpload("file"),
  asyncHandler(widgetController.uploadAttachment)
);

// "Please call me": one open request per conversation, tied to the visitor's own ticket.
widgetRouter.post(
  "/conversations/:ticketId/call-request",
  requireWidgetAuth,
  widgetLimiter,
  validate({ body: callRequestSchema }),
  asyncHandler(widgetController.requestCall)
);
