import { Router } from "express";

import { authController } from "./auth.controller";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema";

import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { authLimiter } from "@/middleware/rate-limit.middleware";
import { validate } from "@/middleware/validate.middleware";


export const authRouter = Router();

authRouter.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register)
);

authRouter.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login)
);

authRouter.post(
  "/refresh",
  authLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(authController.refresh)
);

authRouter.post("/logout", asyncHandler(authController.logout));

authRouter.get("/me", requireAuth, asyncHandler(authController.me));
