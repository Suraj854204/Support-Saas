import { Router } from "express";

import { ticketsController } from "./tickets.controller";
import {
  createMessageSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
} from "./tickets.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validate.middleware";


export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

ticketsRouter.post("/", validate({ body: createTicketSchema }), asyncHandler(ticketsController.create));

ticketsRouter.get("/", validate({ query: listTicketsQuerySchema }), asyncHandler(ticketsController.list));

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
