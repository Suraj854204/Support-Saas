import { z } from "zod";

export const trackingTokenParamSchema = z.object({
  token: z.string().min(1),
});
export type TrackingTokenParam = z.infer<typeof trackingTokenParamSchema>;

export const submitTrackingReplySchema = z.object({
  body: z.string().min(1).max(5000),
});
export type SubmitTrackingReplyInput = z.infer<typeof submitTrackingReplySchema>;
