import { Router } from "express";

import { knowledgeController } from "./knowledge.controller";
import { createArticleSchema, updateArticleSchema } from "./knowledge.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requireRole } from "@/middleware/rbac.middleware";
import { validate } from "@/middleware/validate.middleware";


export const knowledgeRouter = Router();

knowledgeRouter.use(requireAuth);

knowledgeRouter.get("/", asyncHandler(knowledgeController.list));
knowledgeRouter.get("/:id", asyncHandler(knowledgeController.getById));

knowledgeRouter.post(
  "/",
  requireRole("admin"),
  validate({ body: createArticleSchema }),
  asyncHandler(knowledgeController.create)
);

knowledgeRouter.patch(
  "/:id",
  requireRole("admin"),
  validate({ body: updateArticleSchema }),
  asyncHandler(knowledgeController.update)
);

knowledgeRouter.delete("/:id", requireRole("admin"), asyncHandler(knowledgeController.remove));
