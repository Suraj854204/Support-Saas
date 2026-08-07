"use client";

import { Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfidenceRing } from "@/components/tickets/confidence-ring";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { StatusBadge } from "@/components/tickets/status-badge";
import { TicketsPagination } from "@/components/tickets/tickets-pagination";
import { TicketsTableSkeleton } from "@/components/tickets/tickets-table-skeleton";
import type { TicketWithRelations } from "@/hooks/use-tickets";
import { cn } from "@/lib/utils";
import { initials, relativeTime, slaPercentRemaining, ticketRef } from "@/lib/format";
import type { PaginationMeta } from "@support-saas/shared-types";

interface TicketsTableProps {
  tickets: TicketWithRelations[] | undefined;
  meta: PaginationMeta | undefined;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onRowClick?: (ticket: TicketWithRelations) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

export function TicketsTable({
  tickets,
  meta,
  isLoading,
  onPageChange,
  onRowClick,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: TicketsTableProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFocusedIndex(0);
  }, [tickets]);

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

  const allSelected = tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, tickets.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onRowClick?.(tickets[focusedIndex]);
    } else if (e.key === " ") {
      e.preventDefault();
      onToggleSelect(tickets[focusedIndex].id);
    }
  };

  return (
    <div ref={containerRef} onKeyDown={onKeyDown} tabIndex={0} className="outline-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-9">
              <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} aria-label="Select all" />
            </TableHead>
            <TableHead>Ticket</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket, index) => {
            const slaPct = slaPercentRemaining(ticket.createdAt, ticket.slaBreachAt);
            const selected = selectedIds.has(ticket.id);
            return (
              <TableRow
                key={ticket.id}
                className={cn(
                  "cursor-pointer",
                  index === focusedIndex && "bg-muted/50",
                  selected && "bg-primary/5"
                )}
                onClick={() => onRowClick?.(ticket)}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(ticket.id)} />
                </TableCell>
                <TableCell className="max-w-sm">
                  <div className="flex items-center gap-2">
                    {ticket.isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className={cn(
                          "truncate text-sm text-foreground",
                          ticket.isUnread ? "font-semibold" : "font-medium"
                        )}
                      >
                        {ticket.subject}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{ticketRef(ticket.number)}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ticket.customer.name ?? ticket.customer.email ?? "Unknown"}
                </TableCell>
                <TableCell className="text-xs capitalize text-muted-foreground">
                  {ticket.channel.replace("_", " ")}
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
