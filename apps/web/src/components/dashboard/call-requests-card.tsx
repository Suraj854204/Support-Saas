"use client";

import { Phone } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCallRequests, useUpdateCallRequest, type CallStatus } from "@/hooks/use-call-requests";
import { relativeTime } from "@/lib/format";

/** Customers who asked to be phoned. Tap the number to call from a phone or a calling app; then record the outcome. */
export function CallRequestsCard() {
  const { data, isLoading } = useCallRequests();
  const update = useUpdateCallRequest();
  if (isLoading || !data || data.length === 0) return null;

  const set = (id: string, status: CallStatus) =>
    update.mutate({ id, status }, { onError: () => toast.error("Couldn't update that request.") });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4" /> Call requests <span className="text-xs font-normal text-muted-foreground">{data.length} waiting</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <a href={`tel:${r.phone}`} className="font-medium underline">
                  {r.phone}
                </a>
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.preferredTime ? `${r.preferredTime} · ` : ""}
                  {relativeTime(r.createdAt)}
                </span>
                <div className="truncate text-xs text-muted-foreground">
                  <Link href={`/tickets/${r.ticket.id}`} className="underline">
                    #{r.ticket.number} {r.ticket.subject}
                  </Link>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => set(r.id, "completed")}>
                  Done
                </Button>
                <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => set(r.id, "no_answer")}>
                  No answer
                </Button>
                <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => set(r.id, "cancelled")}>
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
