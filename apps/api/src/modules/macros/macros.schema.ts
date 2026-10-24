import { z } from "zod";

const tag = z.string().trim().min(1).max(40);

export const createMacroSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    replyBody: z.string().trim().min(1).max(5000).nullable().optional(),
    setStatus: z.enum(["open", "pending", "on_hold", "solved", "closed"]).nullable().optional(),
    setPriority: z.enum(["low", "normal", "high", "urgent"]).nullable().optional(),
    addTags: z.array(tag).max(10).default([]),
  })
  .refine((m) => Boolean(m.replyBody) || Boolean(m.setStatus) || Boolean(m.setPriority) || m.addTags.length > 0, {
    message: "A macro must do at least one thing: reply, change status or priority, or add a tag",
  });
export type CreateMacroInput = z.infer<typeof createMacroSchema>;

export const updateMacroSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  replyBody: z.string().trim().min(1).max(5000).nullable().optional(),
  setStatus: z.enum(["open", "pending", "on_hold", "solved", "closed"]).nullable().optional(),
  setPriority: z.enum(["low", "normal", "high", "urgent"]).nullable().optional(),
  addTags: z.array(tag).max(10).optional(),
});
export type UpdateMacroInput = z.infer<typeof updateMacroSchema>;

export const applyMacroSchema = z.object({ ticketId: z.string().uuid() });
