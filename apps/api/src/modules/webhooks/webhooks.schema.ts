import { z } from "zod";

import { WEBHOOK_EVENT_TYPES } from "./webhook-events";

const eventsSchema = z.array(z.enum(WEBHOOK_EVENT_TYPES)).max(WEBHOOK_EVENT_TYPES.length);

export const createWebhookSchema = z.object({
  url: z.string().trim().url().max(2048),
  description: z.string().trim().max(200).optional(),
  format: z.enum(["json", "slack"]).default("json"),
  // Empty list means "all events".
  events: eventsSchema.default([]),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z
  .object({
    url: z.string().trim().url().max(2048),
    description: z.string().trim().max(200).nullable(),
    format: z.enum(["json", "slack"]),
    events: eventsSchema,
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const webhookIdParamSchema = z.object({ id: z.string().uuid() });
export const deliveryIdParamSchema = z.object({ deliveryId: z.string().uuid() });
