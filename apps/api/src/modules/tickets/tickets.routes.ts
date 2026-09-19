import { Router } from "express";

import { ticketsController } from "./tickets.controller";
import {
  bulkUpdateTicketsSchema,
  createMessageSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
} from "./tickets.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";


export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

ticketsRouter.post("/", validate({ body: createTicketSchema }), asyncHandler(ticketsController.create));

ticketsRouter.get("/", validate({ query: listTicketsQuerySchema }), asyncHandler(ticketsController.list));

ticketsRouter.patch(
  "/bulk-update",
  validate({ body: bulkUpdateTicketsSchema }),
  asyncHandler(ticketsController.bulkUpdate)
);

ticketsRouter.get("/:id", asyncHandler(ticketsController.getById));

ticketsRouter.patch(
  "/:id",
  validate({ body: updateTicketSchema }),
  asyncHandler(ticketsController.update)
);

ticketsRouter.post(
  "/:id/messages",
  validate({ body: createMessageSchema }),
  asyncHandler(ticketsController.addMessage)
);

ticketsRouter.post("/:id/ai-suggest", asyncHandler(ticketsController.aiSuggest));

ticketsRouter.get("/:id/related", asyncHandler(ticketsController.relatedTickets));
ticketsRouter.get("/:id/notifications", asyncHandler(ticketsController.notifications));
ticketsRouter.get(
  "/:id/audit",
  requirePermission("view_audit_logs"),
  asyncHandler(ticketsController.auditHistory)
);
ticketsRouter.post("/:id/tracking-link", asyncHandler(ticketsController.trackingLink));
