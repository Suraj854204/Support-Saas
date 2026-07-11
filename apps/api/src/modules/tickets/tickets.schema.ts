import { z } from "zod";

export const createTicketSchema = z.object({
  subject: z.string().min(1).max(300),
  customerId: z.string().uuid(),
  channel: z.enum(["email", "chat", "web_widget", "api", "social"]).default("web_widget"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  initialMessage: z.string().min(1).optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  subject: z.string().min(1).max(300).optional(),
  status: z.enum(["open", "pending", "on_hold", "solved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["open", "pending", "on_hold", "solved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigneeId: z.string().uuid().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "priority"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const createMessageSchema = z.object({
  body: z.string().min(1),
  bodyFormat: z.enum(["text", "html", "markdown"]).default("text"),
  isInternalNote: z.boolean().default(false),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
