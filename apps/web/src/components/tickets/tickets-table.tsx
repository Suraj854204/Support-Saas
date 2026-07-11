"use client";

import { Inbox } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfidenceRing } from "@/components/tickets/confidence-ring";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { StatusBadge } from "@/components/tickets/status-badge";
import { TicketsPagination } from "@/components/tickets/tickets-pagination";
import { TicketsTableSkeleton } from "@/components/tickets/tickets-table-skeleton";
import type { TicketWithRelations } from "@/hooks/use-tickets";
import { initials, relativeTime, slaPercentRemaining, ticketRef } from "@/lib/format";
import type { PaginationMeta } from "@support-saas/shared-types";

interface TicketsTableProps {
  tickets: TicketWithRelations[] | undefined;
  meta: PaginationMeta | undefined;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onRowClick?: (ticket: TicketWithRelations) => void;
}

export function TicketsTable({ tickets, meta, isLoading, onPageChange, onRowClick }: TicketsTableProps) {
  if (isLoading && !tickets) {
    return <TicketsTableSkeleton />;
  }

  if (!tickets || tickets.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No tickets match these filters"
        description="Try widening your search, or wait for new conversations to come in through email, chat, or the widget."
      />
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticket</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => {
            const slaPct = slaPercentRemaining(ticket.createdAt, ticket.slaBreachAt);
            return (
              <TableRow
                key={ticket.id}
                className="cursor-pointer"
                onClick={() => onRowClick?.(ticket)}
              >
                <TableCell className="max-w-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{ticket.subject}</span>
                    <span className="font-mono text-xs text-muted-foreground">{ticketRef(ticket.number)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ticket.customer.name ?? ticket.customer.email ?? "Unknown"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={ticket.status} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={ticket.priority} />
                </TableCell>
                <TableCell>
                  {ticket.assignee ? (
                    slaPct !== null ? (
                      <ConfidenceRing value={slaPct} tone="sla" size={32}>
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={ticket.assignee.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {initials(ticket.assignee.name)}
                          </AvatarFallback>
                        </Avatar>
                      </ConfidenceRing>
                    ) : (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={ticket.assignee.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">{initials(ticket.assignee.name)}</AvatarFallback>
                      </Avatar>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{relativeTime(ticket.updatedAt)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {meta && <TicketsPagination meta={meta} onPageChange={onPageChange} />}
    </div>
  );
}
