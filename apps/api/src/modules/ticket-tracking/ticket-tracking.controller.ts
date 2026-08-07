import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";

import type { SubmitTrackingReplyInput, TrackingTokenParam } from "./ticket-tracking.schema";
import { ticketTrackingService } from "./ticket-tracking.service";

import { AppError } from "@/lib/app-error";

export const ticketTrackingController = {
  async getByToken(req: Request<TrackingTokenParam>, res: Response) {
    const tracking = await ticketTrackingService.getByToken(req.params.token);
    if (!tracking) {
      // Deliberately generic — never reveal whether a token existed, expired, or was revoked.
      throw AppError.notFound("This tracking link is invalid or has expired.");
    }
    const body: ApiResponse<typeof tracking> = { success: true, data: tracking };
    res.json(body);
  },

  async submitReply(req: Request<TrackingTokenParam, unknown, SubmitTrackingReplyInput>, res: Response) {
    const tracking = await ticketTrackingService.submitReply(req.params.token, req.body.body);
    if (!tracking) {
      throw AppError.notFound("This tracking link is invalid or has expired.");
    }
    const body: ApiResponse<typeof tracking> = { success: true, data: tracking };
    res.status(201).json(body);
  },
};
