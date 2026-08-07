import type { Permission, UserRole } from "@support-saas/shared-types";

/**
 * Explicit per-role permission grants. Deliberately NOT derived from the
 * existing ROLE_RANK hierarchy in rbac.middleware.ts — a permission model
 * should be checkable on its own terms (e.g. "can this role view audit
 * logs?") without every call site having to know or care about relative
 * role ordering.
 *
 * `owner` and `admin` are spelled out in full rather than inferred, so that
 * adding a new permission always forces a conscious decision about who
 * gets it instead of silently inheriting it.
 */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
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
  ]),
  admin: new Set<Permission>([
    "manage_team",
    "manage_billing",
    "manage_integrations",
    "manage_automation",
    "view_all_tickets",
    "assign_ticket",
    "reply_ticket",
    "delete_ticket",
    "view_audit_logs",
    // manage_security (org-wide session/device policy, etc.) is reserved
    // for owners only.
  ]),
  agent: new Set<Permission>(["reply_ticket", "assign_ticket"]),
  viewer: new Set<Permission>(["view_all_tickets"]),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsForRole(role: UserRole): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role]);
}
