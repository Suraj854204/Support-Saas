import { z } from "zod";

export const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "agent", "viewer"]),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const invitationIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type InvitationIdParam = z.infer<typeof invitationIdParamSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).max(100),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
