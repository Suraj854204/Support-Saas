"use client";

import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDeactivateUser, useOrgUsers, useUpdateUserRole } from "@/hooks/use-users";
import { initials } from "@/lib/format";
import type { UserRole } from "@support-saas/shared-types";

export function MembersTable({ currentUserId, isAdmin }: { currentUserId?: string; isAdmin: boolean }) {
  const { data: users, isLoading } = useOrgUsers();
  const updateRole = useUpdateUserRole();
  const deactivateUser = useDeactivateUser();

  if (isLoading || !users) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          {isAdmin && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          const canEditThisRow = isAdmin && !isSelf; // don't let an admin demote/deactivate themselves by accident

          return (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {user.name} {isSelf && <span className="text-muted-foreground">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {canEditThisRow ? (
                  <Select
                    value={user.role}
                    onValueChange={(v) =>
                      updateRole.mutate(
                        { userId: user.id, role: v as UserRole },
                        { onError: () => toast.error("Couldn't update role.") }
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="muted" className="capitalize">
                    {user.role}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? "success" : "muted"}>
                  {user.isActive ? "Active" : "Deactivated"}
                </Badge>
              </TableCell>
              {isAdmin && (
                <TableCell>
                  {canEditThisRow && user.isActive && (
                    <button
                      className="text-xs text-danger hover:underline"
                      onClick={() =>
                        deactivateUser.mutate(user.id, {
                          onError: () => toast.error("Couldn't deactivate member."),
                        })
                      }
                    >
                      Deactivate
                    </button>
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
