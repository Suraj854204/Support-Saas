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
import { aiInsightsRouter } from "@/modules/ai-insights/ai-insights.routes";
import { analyticsRouter } from "@/modules/analytics/analytics.routes";
import { apiKeysRouter } from "@/modules/api-keys/api-keys.routes";
import { publicAssistantRouter } from "@/modules/assistant/assistant.routes";
import { attachmentsRouter } from "@/modules/attachments/attachments.routes";
import { authRouter } from "@/modules/auth/auth.routes";
import { automationsRouter } from "@/modules/automations/automations.routes";
import { billingRouter, stripeWebhookHandler } from "@/modules/billing/billing.routes";
import { callRequestsRouter } from "@/modules/call-requests/call-requests.routes";
import { cannedResponsesRouter } from "@/modules/canned-responses/canned-responses.routes";
import { filesRouter } from "@/modules/chat-attachments/files.routes";
import { csatRouter } from "@/modules/csat/csat.routes";
import { customersRouter } from "@/modules/customers/customers.routes";
import { demoDataRouter } from "@/modules/demo-data/demo-data.routes";
import { emailIntegrationRouter } from "@/modules/email-integrations/email-integration.routes";
import { escalationsRouter } from "@/modules/escalations/escalations.routes";
import { formsRouter, publicFormsRouter } from "@/modules/forms/forms.routes";
import { importsRouter } from "@/modules/imports/imports.routes";
import { invitationsRouter } from "@/modules/invitations/invitations.routes";
import { knowledgeRouter } from "@/modules/knowledge/knowledge.routes";
import { macrosRouter } from "@/modules/macros/macros.routes";
import { orgsRouter } from "@/modules/orgs/orgs.routes";
import { publicApiRouter } from "@/modules/public-api/public-api.routes";
import { semanticCacheRouter } from "@/modules/semantic-cache/semantic-cache.routes";
import { shopifyRouter } from "@/modules/shopify/shopify.routes";
import { teamsRouter } from "@/modules/teams/teams.routes";
import { ticketTrackingRouter } from "@/modules/ticket-tracking/ticket-tracking.routes";
import { ticketsRouter } from "@/modules/tickets/tickets.routes";
import { usersRouter } from "@/modules/users/users.routes";
import { webhooksRouter } from "@/modules/webhooks/webhooks.routes";
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
  // Stripe signs the exact bytes it sends, so this route must see the RAW body: it is mounted before the JSON parser.
  app.post("/api/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }), stripeWebhookHandler);
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
  app.use("/api/orgs/invitations", invitationsRouter);
  app.use("/api/integrations", emailIntegrationRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/ticket-tracking", ticketTrackingRouter);
  app.use("/api/csat", csatRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/call-requests", callRequestsRouter);
  app.use("/api/automations", automationsRouter);
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/canned-responses", cannedResponsesRouter);
  app.use("/api/semantic-cache", semanticCacheRouter);

  // Integration layer: dashboard management of API keys + webhooks, and the
  // key-authenticated public API those keys unlock.
  app.use("/api/api-keys", apiKeysRouter);
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/ai-insights", aiInsightsRouter);
  app.use("/api/imports", importsRouter);
  app.use("/api/shopify", shopifyRouter);
  app.use("/api/macros", macrosRouter);
  app.use("/api/demo-data", demoDataRouter);
  app.use("/api/public/v1", publicApiRouter);
  app.use("/api/forms", formsRouter);
  app.use("/api/escalations", escalationsRouter);

  // Customers' own websites post here from the browser: credential-free CORS like the widget.
  // Who may actually submit is decided per form (public key + origin allow-list), not by CORS.
  app.use("/api/public/forms", cors({ origin: true, credentials: false }), publicFormsRouter);
  app.use("/api/public/assistant", cors({ origin: true, credentials: false }), publicAssistantRouter);

  // The chat widget is embedded on arbitrary third-party sites and
  // authenticates with a Bearer token, never cookies — so it gets its own
  // permissive, credential-free CORS policy instead of the app-only one above.
  app.use("/api/widget", cors({ origin: true, credentials: false }), widgetRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
