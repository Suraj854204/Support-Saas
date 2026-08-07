"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { StatusBadge } from "@/components/tickets/status-badge";
import { useTickets } from "@/hooks/use-tickets";
import { initials, relativeTime, ticketRef } from "@/lib/format";

export function RecentTicketsCard() {
  const { data, isLoading } = useTickets({ page: 1, pageSize: 5, sortBy: "updatedAt", sortOrder: "desc" });
  const tickets = data?.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
        <Link href="/tickets" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading && !tickets ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))
        ) : !tickets || tickets.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No tickets yet"
            description="New conversations from email, chat, and the widget will show up here."
            className="border-none py-8"
          />
        ) : (
          tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/tickets/${ticket.id}`}
              className="flex items-center gap-3 rounded-md px-2 py-2 -mx-2 transition-colors hover:bg-muted"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={ticket.assignee?.avatarUrl ?? undefined} />
                <AvatarFallback className="text-xs">
                  {ticket.assignee ? initials(ticket.assignee.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {ticketRef(ticket.number)} · {relativeTime(ticket.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <PriorityBadge priority={ticket.priority} />
                <StatusBadge status={ticket.status} />
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
