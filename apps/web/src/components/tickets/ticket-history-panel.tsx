"use client";

import Link from "next/link";
import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useRelatedTickets, useTicketAuditHistory } from "@/hooks/use-tickets";
import { relativeTime, ticketRef } from "@/lib/format";

export function TicketHistoryPanel({ ticketId }: { ticketId: string }) {
  const { data: related } = useRelatedTickets(ticketId);
  // Server enforces view_audit_logs — a non-privileged viewer's request
  // fails and this section just doesn't render, no separate client check needed.
  const { data: audit, error: auditError } = useTicketAuditHistory(ticketId);

  const hasRelated = related && related.length > 0;
  const hasAudit = audit && audit.length > 0 && !auditError;

  if (!hasRelated && !hasAudit) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <History className="h-3.5 w-3.5" /> History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasRelated && (
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Related tickets from this customer</span>
            {related.map((t) => (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="flex items-center justify-between text-xs hover:underline"
              >
                <span className="truncate">{t.subject}</span>
                <span className="font-mono text-muted-foreground">{ticketRef(t.number)}</span>
              </Link>
            ))}
          </div>
        )}

        {hasRelated && hasAudit && <Separator />}

        {hasAudit && (
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Audit history</span>
            {audit.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{entry.action}</span>
                <Badge variant="outline" className="text-[10px]">
                  {relativeTime(entry.createdAt)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
