"use client";

import { Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCurrentUser } from "@/hooks/use-auth";
import { useAddTeamMember, useDeleteTeam, useRemoveTeamMember, type TeamWithMembers } from "@/hooks/use-teams";
import { useOrgUsers } from "@/hooks/use-users";
import { initials } from "@/lib/format";

export function TeamCard({ team }: { team: TeamWithMembers }) {
  const { data: currentUser } = useCurrentUser();
  const { data: allUsers } = useOrgUsers();
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const deleteTeam = useDeleteTeam();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const isAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  const memberIds = new Set(team.members.map((m) => m.userId));
  const availableUsers = (allUsers ?? []).filter((u) => !memberIds.has(u.id));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">{team.name}</CardTitle>
        {isAdmin && (
          <button
            className="text-muted-foreground hover:text-danger"
            aria-label="Delete team"
            onClick={() =>
              deleteTeam.mutate(team.id, {
                onError: () => toast.error("Couldn't delete the team."),
              })
            }
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {team.members.length === 0 && <p className="text-xs text-muted-foreground">No members yet.</p>}
          {team.members.map((member) => (
            <div
              key={member.userId}
              className="group flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-1 pr-2 text-xs"
            >
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">{initials(member.user.name)}</AvatarFallback>
              </Avatar>
              <span>{member.user.name}</span>
              {isAdmin && (
                <button
                  aria-label={`Remove ${member.user.name}`}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  onClick={() =>
                    removeMember.mutate(
                      { teamId: team.id, userId: member.userId },
                      { onError: () => toast.error("Couldn't remove member.") }
                    )
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Add member
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              {availableUsers.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Everyone in your org is already on this team.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto">
                  {availableUsers.map((u) => (
                    <button
                      key={u.id}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        addMember.mutate(
                          { teamId: team.id, userId: u.id },
                          { onError: () => toast.error("Couldn't add member.") }
                        );
                        setPopoverOpen(false);
                      }}
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      {u.name}
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </CardContent>
    </Card>
  );
}
