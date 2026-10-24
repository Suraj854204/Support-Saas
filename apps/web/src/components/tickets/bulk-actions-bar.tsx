"use client";

import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBulkUpdateTickets } from "@/hooks/use-tickets";
import { useOrgUsers } from "@/hooks/use-users";
import { ApiRequestError } from "@/lib/api-client";
import type { TicketStatus } from "@support-saas/shared-types";

const UNASSIGNED = "unassigned";

export function BulkActionsBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const bulkUpdate = useBulkUpdateTickets();
  const { data: users } = useOrgUsers();

  if (selectedIds.length === 0) return null;

  const runUpdate = (patch: { status?: TicketStatus; assigneeId?: string | null }) => {
    bulkUpdate.mutate(
      { ticketIds: selectedIds, ...patch },
      {
        onSuccess: (results) => {
          const failed = results.filter((r) => !r.success).length;
          if (failed > 0) {
            toast.error(`Updated ${results.length - failed} of ${results.length} — ${failed} failed`);
          } else {
            toast.success(`Updated ${results.length} ticket${results.length === 1 ? "" : "s"}`);
          }
          onClear();
        },
        onError: (err) => {
          toast.error(err instanceof ApiRequestError ? err.message : "Bulk update failed.");
        },
      }
    );
  };

  return (
    <div className="mb-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-sm font-medium">
        {selectedIds.length} selected
      </span>

      <Select onValueChange={(v) => runUpdate({ status: v as TicketStatus })} disabled={bulkUpdate.isPending}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue placeholder="Set status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="on_hold">On hold</SelectItem>
          <SelectItem value="solved">Solved</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      <Select
        onValueChange={(v) => runUpdate({ assigneeId: v === UNASSIGNED ? null : v })}
        disabled={bulkUpdate.isPending}
      >
        <SelectTrigger className="h-8 w-40">
          <SelectValue placeholder="Assign to" />
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

      <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={onClear}>
        <X className="h-3.5 w-3.5" />
        Clear
      </Button>
    </div>
  );
}
