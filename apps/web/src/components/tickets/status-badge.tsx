import { Badge } from "@/components/ui/badge";
import type { TicketStatus } from "@support-saas/shared-types";

const STATUS_CONFIG: Record<TicketStatus, { label: string; variant: "default" | "muted" | "success" | "warning" }> = {
  open: { label: "Open", variant: "default" },
  pending: { label: "Pending", variant: "warning" },
  on_hold: { label: "On hold", variant: "muted" },
  solved: { label: "Solved", variant: "success" },
  closed: { label: "Closed", variant: "muted" },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
