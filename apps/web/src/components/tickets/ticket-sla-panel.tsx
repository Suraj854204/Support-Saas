import { AlertTriangle, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import type { TicketDetail } from "@/hooks/use-tickets";

function DueRow({ label, dueAt, metAt }: { label: string; dueAt: string | null; metAt: string | null }) {
  if (!dueAt) return null;

  const isPast = new Date(dueAt) < new Date();
  const met = Boolean(metAt);

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={met ? "text-success" : isPast ? "text-danger" : "text-foreground"}>
        {met ? `Met ${relativeTime(metAt as string)}` : `${isPast ? "Was due" : "Due"} ${relativeTime(dueAt)}`}
      </span>
    </div>
  );
}

export function TicketSlaPanel({ ticket }: { ticket: TicketDetail }) {
  if (!ticket.firstResponseDueAt && !ticket.slaBreachAt) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> SLA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <DueRow label="First response" dueAt={ticket.firstResponseDueAt} metAt={ticket.firstRespondedAt} />
        <DueRow label="Resolution" dueAt={ticket.slaBreachAt} metAt={ticket.resolvedAt} />

        {(ticket.slaBreached || ticket.escalatedAt) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ticket.slaBreached && (
              <Badge variant="danger" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Breached
              </Badge>
            )}
            {ticket.escalatedAt && (
              <Badge variant="warning">Escalated {relativeTime(ticket.escalatedAt)}</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
