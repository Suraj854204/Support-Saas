import { Router } from "express";

import { customersController } from "./customers.controller";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  mergeCustomerSchema,
  updateCustomerSchema,
} from "./customers.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validate.middleware";

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", validate({ query: listCustomersQuerySchema }), asyncHandler(customersController.list));
customersRouter.post("/", validate({ body: createCustomerSchema }), asyncHandler(customersController.create));

customersRouter.get("/:id", asyncHandler(customersController.getById));
customersRouter.patch(
  "/:id",
  validate({ body: updateCustomerSchema }),
  asyncHandler(customersController.update)
);
customersRouter.post(
  "/:id/merge",
  validate({ body: mergeCustomerSchema }),
  asyncHandler(customersController.merge)
);
customersRouter.get("/:id/export", asyncHandler(customersController.exportData));
customersRouter.delete("/:id", asyncHandler(customersController.requestDeletion));
