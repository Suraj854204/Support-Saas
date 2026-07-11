import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { errorHandler, notFoundHandler } from "@/middleware/error.middleware";
import { defaultLimiter } from "@/middleware/rate-limit.middleware";
import { analyticsRouter } from "@/modules/analytics/analytics.routes";
import { authRouter } from "@/modules/auth/auth.routes";
import { customersRouter } from "@/modules/customers/customers.routes";
import { knowledgeRouter } from "@/modules/knowledge/knowledge.routes";
import { orgsRouter } from "@/modules/orgs/orgs.routes";
import { teamsRouter } from "@/modules/teams/teams.routes";
import { ticketsRouter } from "@/modules/tickets/tickets.routes";
import { usersRouter } from "@/modules/users/users.routes";
import { widgetRouter } from "@/modules/widget/widget.routes";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1); // behind nginx/ALB in every non-local environment

  app.use(helmet());
  app.use(
    cors({
      origin: env.NEXT_PUBLIC_APP_URL,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV === "production" }));
  app.use(defaultLimiter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "api", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/orgs", orgsRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/analytics", analyticsRouter);

  // The chat widget is embedded on arbitrary third-party sites and
  // authenticates with a Bearer token, never cookies — so it gets its own
  // permissive, credential-free CORS policy instead of the app-only one above.
  app.use("/api/widget", cors({ origin: true, credentials: false }), widgetRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
