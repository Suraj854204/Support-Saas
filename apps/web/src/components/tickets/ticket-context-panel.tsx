"use client";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ConfidenceRing } from "@/components/tickets/confidence-ring";
import type { TicketDetail } from "@/hooks/use-tickets";
import { useUpdateTicket } from "@/hooks/use-tickets";
import { useOrgUsers } from "@/hooks/use-users";
import { initials } from "@/lib/format";
import type { TicketPriority, TicketStatus } from "@support-saas/shared-types";

const UNASSIGNED = "unassigned";

export function TicketContextPanel({ ticket }: { ticket: TicketDetail }) {
  const updateTicket = useUpdateTicket();
  const { data: users } = useOrgUsers();

  const onError = () => toast.error("Couldn't update the ticket. Try again.");

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{initials(ticket.customer.name ?? ticket.customer.email ?? "?")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{ticket.customer.name ?? "Unknown"}</p>
            <p className="truncate text-xs text-muted-foreground">{ticket.customer.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Properties
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select
              value={ticket.status}
              onValueChange={(v) => updateTicket.mutate({ id: ticket.id, status: v as TicketStatus }, { onError })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="solved">Solved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Priority</span>
            <Select
              value={ticket.priority}
              onValueChange={(v) =>
                updateTicket.mutate({ id: ticket.id, priority: v as TicketPriority }, { onError })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Assignee</span>
            <Select
              value={ticket.assigneeId ?? UNASSIGNED}
              onValueChange={(v) =>
                updateTicket.mutate({ id: ticket.id, assigneeId: v === UNASSIGNED ? null : v } as never, {
                  onError,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {users?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ai">
            <Sparkles className="h-3.5 w-3.5" /> AI insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ticket.aiSummary ? (
            <p className="text-sm text-foreground">{ticket.aiSummary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No AI summary yet — this populates automatically once the conversation has customer messages
              to analyze.
            </p>
          )}
          {ticket.aiSentiment && (
            <>
              <Separator />
              <div className="flex items-center gap-3">
                <ConfidenceRing
                  value={100}
                  tone={`sentiment-${ticket.aiSentiment}` as "sentiment-positive" | "sentiment-neutral" | "sentiment-negative"}
                  size={28}
                />
                <span className="text-xs capitalize text-muted-foreground">
                  Customer sentiment: <span className="font-medium text-foreground">{ticket.aiSentiment}</span>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
