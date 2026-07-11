import { Router } from "express";

import { customersController } from "./customers.controller";
import { createCustomerSchema, listCustomersQuerySchema } from "./customers.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validate.middleware";


export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", validate({ query: listCustomersQuerySchema }), asyncHandler(customersController.list));
customersRouter.post("/", validate({ body: createCustomerSchema }), asyncHandler(customersController.create));
