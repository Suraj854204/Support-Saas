import type { ApiResponse } from "@support-saas/shared-types";
import { Router, type Request, type Response } from "express";

import {
  createEvalCaseSchema,
  feedbackBodySchema,
  idParamSchema,
  listTracesQuerySchema,
  statsQuerySchema,
  updateEvalCaseSchema,
} from "./ai-insights.schema";
import { aiTraceService } from "./ai-trace.service";
import { evalService } from "./eval.service";

import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireAuth } from "@/middleware/auth.middleware";
import { requirePermission } from "@/middleware/permission.middleware";
import { validate } from "@/middleware/validate.middleware";

export const aiInsightsRouter = Router();

aiInsightsRouter.use(requireAuth);

function auth(req: Request) {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

function ok<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ success: true, data } satisfies ApiResponse<T>);
}

// ---------------------------------------------------------------------------
// Traces — "why did the AI say that?" Contains customer conversation text, so
// reading them needs the same permission as reading audit logs.
// ---------------------------------------------------------------------------

aiInsightsRouter.get(
  "/stats",
  requirePermission("view_audit_logs"),
  validate({ query: statsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    ok(res, await aiTraceService.stats(orgId, (req.query as unknown as { days: number }).days));
  })
);

aiInsightsRouter.get(
  "/traces",
  requirePermission("view_audit_logs"),
  validate({ query: listTracesQuerySchema }),
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    const { items, meta } = await aiTraceService.list(orgId, req.query as never);
    res.json({ success: true, data: items, meta } satisfies ApiResponse<typeof items>);
  })
);

aiInsightsRouter.get(
  "/traces/:id",
  requirePermission("view_audit_logs"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    ok(res, await aiTraceService.getById(orgId, req.params.id as string));
  })
);

// Any agent who can reply to tickets can rate the AI's suggestion.
aiInsightsRouter.post(
  "/traces/:id/feedback",
  requirePermission("reply_ticket"),
  validate({ params: idParamSchema, body: feedbackBodySchema }),
  asyncHandler(async (req, res) => {
    const { orgId } = auth(req);
    ok(res, await aiTraceService.setFeedback(orgId, req.params.id as string, req.body.feedback, req.body.note));
  })
);

// ---------------------------------------------------------------------------
// Eval suite — saved questions with expectations, re-run on demand.
// ---------------------------------------------------------------------------

aiInsightsRouter.get(
  "/eval/cases",
  requirePermission("manage_integrations"),
  asyncHandler(async (req, res) => {
    ok(res, await evalService.listCases(auth(req).orgId));
  })
);

aiInsightsRouter.post(
  "/eval/cases",
  requirePermission("manage_integrations"),
  validate({ body: createEvalCaseSchema }),
  asyncHandler(async (req, res) => {
    const { orgId, userId } = auth(req);
    ok(res, await evalService.createCase(orgId, userId, req.body), 201);
  })
);

aiInsightsRouter.patch(
  "/eval/cases/:id",
  requirePermission("manage_integrations"),
  validate({ params: idParamSchema, body: updateEvalCaseSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await evalService.updateCase(auth(req).orgId, req.params.id as string, req.body));
  })
);

aiInsightsRouter.delete(
  "/eval/cases/:id",
  requirePermission("manage_integrations"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await evalService.deleteCase(auth(req).orgId, req.params.id as string);
    ok(res, { deleted: true as const });
  })
);

aiInsightsRouter.post(
  "/eval/runs",
  requirePermission("manage_integrations"),
  asyncHandler(async (req, res) => {
    const { orgId, userId } = auth(req);
    ok(res, await evalService.run(orgId, userId), 201);
  })
);

aiInsightsRouter.get(
  "/eval/runs",
  requirePermission("manage_integrations"),
  asyncHandler(async (req, res) => {
    ok(res, await evalService.listRuns(auth(req).orgId));
  })
);

aiInsightsRouter.get(
  "/eval/runs/:id",
  requirePermission("manage_integrations"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await evalService.getRun(auth(req).orgId, req.params.id as string));
  })
);
