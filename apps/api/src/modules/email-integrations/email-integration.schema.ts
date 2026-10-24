import { z } from "zod";

export const gmailCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().min(1, "Missing OAuth state"),
  error: z.string().optional(),
});
export type GmailCallbackQuery = z.infer<typeof gmailCallbackQuerySchema>;

export const patchEmailSettingsSchema = z.object({
  autoCreateTickets: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
});
export type PatchEmailSettingsInput = z.infer<typeof patchEmailSettingsSchema>;
