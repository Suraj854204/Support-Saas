import { z } from "zod";

export const createCannedResponseSchema = z.object({
  name: z.string().min(1).max(100),
  body: z.string().min(1).max(5000),
});
export type CreateCannedResponseInput = z.infer<typeof createCannedResponseSchema>;

export const updateCannedResponseSchema = createCannedResponseSchema.partial();
export type UpdateCannedResponseInput = z.infer<typeof updateCannedResponseSchema>;
