"use client";

import { Users2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TeamCard } from "@/components/teams/team-card";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";
import { useTeams } from "@/hooks/use-teams";

export default function TeamsPage() {
  const { data: teams, isLoading } = useTeams();

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Group agents together and route tickets by specialty."
        actions={<TeamFormDialog />}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : !teams || teams.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="No teams yet"
          description="Create a team to group agents together and route tickets by specialty."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}
    </div>
  );
}
