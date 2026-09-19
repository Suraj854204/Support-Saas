import { z } from "zod";

const conditionSchema = z.object({
  field: z.enum([
    "subject",
    "message_text",
    "customer_tags",
    "channel",
    "priority",
    "status",
    "team",
    "business_hours",
  ]),
  operator: z.enum(["contains", "equals", "not_equals", "in"]),
  value: z.string().min(1).max(200),
});

const actionSchema = z.object({
  type: z.enum(["set_priority", "assign_team", "add_tag", "send_email"]),
  value: z.string().min(1).max(2000),
});

export const createAutomationRuleSchema = z.object({
  name: z.string().min(1).max(150),
  trigger: z.enum([
    "ticket_created",
    "customer_replied",
    "status_changed",
    "sla_approaching",
    "sla_breached",
    "ticket_inactive",
    "ticket_reopened",
  ]),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(actionSchema).min(1).max(10),
  triggerConfig: z.record(z.union([z.string(), z.number()])).default({}),
});
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;

export const updateAutomationRuleSchema = createAutomationRuleSchema.partial();
export type UpdateAutomationRuleInput = z.infer<typeof updateAutomationRuleSchema>;
