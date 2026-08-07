import type { TicketPriority } from "@support-saas/shared-types";

import { addBusinessMinutes, isValidBusinessHoursConfig, type BusinessHoursConfig } from "@/lib/business-hours";

export interface SlaPolicy {
  firstResponseMinutes: Record<TicketPriority, number>;
  resolutionMinutes: Record<TicketPriority, number>;
  escalationEnabled: boolean;
  escalateAfterMinutes: number;
  escalateToUserId: string | null;
}

// The spec's own example (Urgent: 1h, High: 4h, Normal: 24h, Low: 48h) is
// used here as the first-response defaults; resolution defaults are a 4x
// multiple — both fully overridable per org.
export const DEFAULT_SLA_POLICY: SlaPolicy = {
  firstResponseMinutes: { urgent: 60, high: 240, normal: 1440, low: 2880 },
  resolutionMinutes: { urgent: 240, high: 960, normal: 5760, low: 11520 },
  escalationEnabled: false,
  escalateAfterMinutes: 60,
  escalateToUserId: null,
};

export function resolveSlaPolicy(raw: unknown): SlaPolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_SLA_POLICY;
  const partial = raw as Partial<SlaPolicy>;
  return {
    firstResponseMinutes: { ...DEFAULT_SLA_POLICY.firstResponseMinutes, ...partial.firstResponseMinutes },
    resolutionMinutes: { ...DEFAULT_SLA_POLICY.resolutionMinutes, ...partial.resolutionMinutes },
    escalationEnabled: partial.escalationEnabled ?? DEFAULT_SLA_POLICY.escalationEnabled,
    escalateAfterMinutes: partial.escalateAfterMinutes ?? DEFAULT_SLA_POLICY.escalateAfterMinutes,
    escalateToUserId: partial.escalateToUserId ?? null,
  };
}

export function resolveBusinessHours(raw: unknown): BusinessHoursConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<BusinessHoursConfig>;
  return isValidBusinessHoursConfig(candidate) ? candidate : null;
}

/**
 * Computes when a ticket's first-response and resolution SLAs are due,
 * starting from `from` (normally the ticket's creation time). Uses
 * business-hours math when the org has one configured; otherwise falls
 * back to plain elapsed-time (a straight `from + minutes`).
 */
export function computeSlaDueDates(
  from: Date,
  priority: TicketPriority,
  policy: SlaPolicy,
  businessHours: BusinessHoursConfig | null
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
  const firstResponseMinutes = policy.firstResponseMinutes[priority];
  const resolutionMinutes = policy.resolutionMinutes[priority];

  if (businessHours) {
    return {
      firstResponseDueAt: addBusinessMinutes(from, firstResponseMinutes, businessHours),
      resolutionDueAt: addBusinessMinutes(from, resolutionMinutes, businessHours),
    };
  }

  return {
    firstResponseDueAt: new Date(from.getTime() + firstResponseMinutes * 60_000),
    resolutionDueAt: new Date(from.getTime() + resolutionMinutes * 60_000),
  };
}
