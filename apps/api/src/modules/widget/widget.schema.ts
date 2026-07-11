import { z } from "zod";

export const startConversationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});
export type StartConversationInput = z.infer<typeof startConversationSchema>;

export const widgetMessageSchema = z.object({
  body: z.string().min(1).max(5000),
});
export type WidgetMessageInput = z.infer<typeof widgetMessageSchema>;
