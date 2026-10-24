import { cn } from "@/lib/utils";
import type { TicketPriority } from "@support-saas/shared-types";

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; dot: string; text: string }> = {
  low: { label: "Low", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  normal: { label: "Normal", dot: "bg-primary", text: "text-foreground" },
  high: { label: "High", dot: "bg-warning", text: "text-warning" },
  urgent: { label: "Urgent", dot: "bg-danger", text: "text-danger" },
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", config.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
