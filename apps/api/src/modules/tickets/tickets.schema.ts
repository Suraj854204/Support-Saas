import { z } from "zod";

export const createTicketSchema = z.object({
  subject: z.string().min(1).max(300),
  customerId: z.string().uuid(),
  channel: z.enum(["email", "chat", "web_widget", "api", "social"]).default("web_widget"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  initialMessage: z.string().min(1).max(20_000).optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  subject: z.string().min(1).max(300).optional(),
  status: z.enum(["open", "pending", "on_hold", "solved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(30).optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["open", "pending", "on_hold", "solved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  channel: z.enum(["email", "chat", "web_widget", "api", "social"]).optional(),
  teamId: z.string().uuid().optional(),
  // "unassigned" is a sentinel, not a real user id — kept as a separate
  // param rather than overloading assigneeId so both can combine cleanly
  // with normal UUID filtering.
  assigneeId: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  unreadOnly: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "priority"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const bulkUpdateTicketsSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(["open", "pending", "on_hold", "solved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
});
export type BulkUpdateTicketsInput = z.infer<typeof bulkUpdateTicketsSchema>;

export const createMessageSchema = z
  .object({
    body: z.string().max(20_000).default(""),
    bodyFormat: z.enum(["text", "html", "markdown"]).default("text"),
    isInternalNote: z.boolean().default(false),
    attachmentIds: z.array(z.string().uuid()).max(5).default([]),
  })
  .refine((v) => v.body.trim().length > 0 || v.attachmentIds.length > 0, { message: "Write a message or attach a file", path: ["body"] });
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
