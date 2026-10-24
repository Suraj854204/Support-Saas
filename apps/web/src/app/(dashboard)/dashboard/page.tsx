"use client";

import { OnboardingHost } from "@/components/onboarding/onboarding-host";
import { CallRequestsCard } from "@/components/dashboard/call-requests-card";
import { CsatCard } from "@/components/dashboard/csat-card";
import { QueuePulse } from "@/components/dashboard/queue-pulse";
import { RecentTicketsCard } from "@/components/dashboard/recent-tickets-card";
import { TicketsVolumeChart, type TicketVolumePoint } from "@/components/dashboard/tickets-volume-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiStats } from "@/hooks/use-ai-insights";
import { useAnalyticsSummary, useTicketsVolume } from "@/hooks/use-analytics";
import { useCurrentUser } from "@/hooks/use-auth";

function formatChartData(points: TicketVolumePoint[]): TicketVolumePoint[] {
  return points.map((p) => ({
    ...p,
    date: new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const { data: volume, isLoading: volumeLoading } = useTicketsVolume(14);
  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();
  const { data: ai } = useAiStats(7, isAdmin);

  const firstName = user?.name?.split(" ")[0];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{today}</p>
      </div>

      <OnboardingHost />

      {summaryLoading || !summary ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <QueuePulse
          open={summary.openTickets}
          atRisk={summary.slaAtRisk}
          metrics={[
            {
              label: "First response",
              hint: "Average, all channels",
              value: summary.avgFirstResponseMinutes !== null ? `${summary.avgFirstResponseMinutes}m` : "—",
            },
            { label: "Resolved today", value: String(summary.resolvedToday) },
            ...(ai && ai.satisfactionRate !== null
              ? [
                  {
                    label: "AI suggestions approved",
                    hint: `Last 7 days · ${ai.rated} rated`,
                    value: `${Math.round(ai.satisfactionRate * 100)}%`,
                  },
                ]
              : []),
          ]}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {volumeLoading || !volume ? (
            <Skeleton className="h-[22rem] w-full rounded-xl" />
          ) : (
            <TicketsVolumeChart data={formatChartData(volume)} />
          )}
        </div>
        <RecentTicketsCard />
      </div>
      <CallRequestsCard />
      <CsatCard />
    </div>
  );
}
