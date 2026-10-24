"use client";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvitations, useRevokeInvitation } from "@/hooks/use-invitations";
import { ApiRequestError } from "@/lib/api-client";
import type { Invitation } from "@/hooks/use-invitations";

const STATUS_VARIANT: Record<Invitation["status"], "warning" | "success" | "muted" | "danger"> = {
  pending: "warning",
  accepted: "success",
  revoked: "muted",
  expired: "muted",
};

export function InvitationsTable() {
  const { data: invitations, isLoading } = useInvitations();
  const revoke = useRevokeInvitation();

  if (isLoading || !invitations) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return <p className="text-sm text-muted-foreground">No invitations sent yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell className="text-sm">{invitation.email}</TableCell>
            <TableCell>
              <Badge variant="muted" className="capitalize">
                {invitation.role}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[invitation.status]} className="capitalize">
                {invitation.status}
              </Badge>
            </TableCell>
            <TableCell>
              {invitation.status === "pending" && (
                <button
                  className="text-xs text-danger hover:underline"
                  onClick={() =>
                    revoke.mutate(invitation.id, {
                      onError: (err) =>
                        toast.error(err instanceof ApiRequestError ? err.message : "Couldn't revoke invitation."),
                    })
                  }
                >
                  Revoke
                </button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
