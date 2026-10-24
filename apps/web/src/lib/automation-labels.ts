import type { ActionType, AutomationAction, AutomationCondition, ConditionField, ConditionOperator } from "@/hooks/use-automations";

export const FIELD_LABELS: Record<ConditionField, string> = {
  subject: "Subject",
  message_text: "Message text",
  customer_tags: "Customer tag",
  channel: "Channel",
  priority: "Priority",
  status: "Status",
  team: "Team",
  business_hours: "Within business hours",
  customer_vip: "Customer is VIP",
  customer_email_domain: "Customer email domain",
  ticket_age_hours: "Ticket age (hours)",
  sentiment: "Customer sentiment",
  assignee: "Assignment",
};

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  contains: "contains",
  not_contains: "doesn't contain",
  equals: "is",
  not_equals: "is not",
  in: "is one of",
  gt: "is more than",
  lt: "is less than",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  set_priority: "Set priority",
  assign_team: "Assign to team",
  assign_agent: "Assign to agent",
  add_tag: "Add tag",
  remove_tag: "Remove tag",
  set_status: "Set status",
  add_internal_note: "Add internal note",
  send_email: "Send email reply",
  stop_processing: "Stop running other rules",
};

/** Which operators make sense for which field, so the form can't build nonsense like "age contains vip". */
export const OPERATORS_BY_FIELD: Record<ConditionField, ConditionOperator[]> = {
  subject: ["contains", "not_contains", "equals"],
  message_text: ["contains", "not_contains"],
  customer_tags: ["contains", "not_contains"],
  channel: ["equals", "not_equals", "in"],
  priority: ["equals", "not_equals", "in"],
  status: ["equals", "not_equals", "in"],
  team: ["equals", "not_equals"],
  business_hours: ["equals"],
  customer_vip: ["equals"],
  customer_email_domain: ["equals", "not_equals", "contains"],
  ticket_age_hours: ["gt", "lt"],
  sentiment: ["equals", "not_equals"],
  assignee: ["equals"],
};

export function describeCondition(c: AutomationCondition): string {
  const field = FIELD_LABELS[c.field] ?? c.field;
  const op = OPERATOR_LABELS[c.operator] ?? c.operator;
  return `${field} ${op} "${c.value}"`;
}

export function describeAction(a: AutomationAction): string {
  const label = ACTION_LABELS[a.type] ?? a.type;
  if (a.type === "stop_processing") return label;
  if (a.type === "assign_agent" && a.value === "least_loaded") return `${label}: least-loaded agent`;
  return `${label}: ${a.value.slice(0, 40)}`;
}
