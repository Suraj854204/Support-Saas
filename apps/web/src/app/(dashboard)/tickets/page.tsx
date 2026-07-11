"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { TicketsToolbar } from "@/components/tickets/tickets-toolbar";
import type { ListTicketsParams } from "@/hooks/use-tickets";
import { useTickets } from "@/hooks/use-tickets";

export default function TicketsPage() {
  const router = useRouter();
  const [params, setParams] = useState<ListTicketsParams>({
    page: 1,
    pageSize: 25,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const { data, isLoading, isFetching } = useTickets(params);

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Every conversation across email, chat, and the widget in one queue."
        actions={<NewTicketDialog />}
      />

      <div className="mb-4">
        <TicketsToolbar params={params} onChange={setParams} />
      </div>

      <Card className="overflow-hidden">
        <TicketsTable
          tickets={data?.data}
          meta={data?.meta}
          isLoading={isLoading || isFetching}
          onPageChange={(page) => setParams((p) => ({ ...p, page }))}
          onRowClick={(ticket) => router.push(`/tickets/${ticket.id}`)}
        />
      </Card>
    </div>
  );
}

