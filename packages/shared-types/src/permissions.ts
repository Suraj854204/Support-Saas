export type Permission =
  | "manage_team"
  | "manage_billing"
  | "manage_integrations"
  | "manage_automation"
  | "view_all_tickets"
  | "assign_ticket"
  | "reply_ticket"
  | "delete_ticket"
  | "view_audit_logs"
  | "manage_security";

export const ALL_PERMISSIONS: Permission[] = [
  "manage_team",
  "manage_billing",
  "manage_integrations",
  "manage_automation",
  "view_all_tickets",
  "assign_ticket",
  "reply_ticket",
  "delete_ticket",
  "view_audit_logs",
  "manage_security",
];
