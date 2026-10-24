import { z } from "zod";

export const trackingTokenParamSchema = z.object({
  token: z.string().min(1),
});
export type TrackingTokenParam = z.infer<typeof trackingTokenParamSchema>;

export const submitTrackingReplySchema = z.object({
  body: z.string().min(1).max(5000),
});
export type SubmitTrackingReplyInput = z.infer<typeof submitTrackingReplySchema>;

export const submitRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type SubmitRatingInput = z.infer<typeof submitRatingSchema>;
