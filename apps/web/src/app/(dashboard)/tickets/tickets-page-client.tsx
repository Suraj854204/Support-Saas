"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { BulkActionsBar } from "@/components/tickets/bulk-actions-bar";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { TicketsToolbar } from "@/components/tickets/tickets-toolbar";
import type { ListTicketsParams } from "@/hooks/use-tickets";
import { useTickets } from "@/hooks/use-tickets";

export function TicketsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [params, setParams] = useState<ListTicketsParams>({
    page: 1,
    pageSize: 25,
    sortBy: "createdAt",
    sortOrder: "desc",
    // Seeds from the URL once on mount — e.g. the workload panel links here
    // with ?assigneeId=... to show a specific agent's queue.
    assigneeId: searchParams.get("assigneeId") ?? undefined,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching } = useTickets(params);

  const onChangeParams = (next: ListTicketsParams) => {
    setSelectedIds(new Set());
    setParams(next);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const allSelected = data?.data && data.data.length > 0 && data.data.every((t) => prev.has(t.id));
      if (allSelected) return new Set();
      return new Set(data?.data?.map((t) => t.id) ?? []);
    });
  };

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Every conversation across email, chat, and the widget in one queue."
        actions={<NewTicketDialog />}
      />

      <div className="mb-4">
        <TicketsToolbar params={params} onChange={onChangeParams} />
      </div>

      <BulkActionsBar selectedIds={Array.from(selectedIds)} onClear={() => setSelectedIds(new Set())} />

      <Card className="overflow-hidden">
        <TicketsTable
          tickets={data?.data}
          meta={data?.meta}
          isLoading={isLoading || isFetching}
          onPageChange={(page) => setParams((p) => ({ ...p, page }))}
          onRowClick={(ticket) => router.push(`/tickets/${ticket.id}`)}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      </Card>
    </div>
  );
}
