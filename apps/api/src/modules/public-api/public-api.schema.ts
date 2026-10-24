import { z } from "zod";

export const publicCreateTicketSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  message: z.string().trim().min(1).max(20_000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  customer: z.object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().max(200).optional(),
  }),
});
export type PublicCreateTicketInput = z.infer<typeof publicCreateTicketSchema>;

export const publicAddMessageSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
});

export const publicListTicketsQuerySchema = z.object({
  status: z.enum(["open", "pending", "on_hold", "solved", "closed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const publicTicketIdParamSchema = z.object({ id: z.string().uuid() });
