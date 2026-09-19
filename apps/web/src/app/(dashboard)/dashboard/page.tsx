"use client";

import { AlertTriangle, CheckCircle2, Clock, Inbox } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { RecentTicketsCard } from "@/components/dashboard/recent-tickets-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { TicketsVolumeChart, type TicketVolumePoint } from "@/components/dashboard/tickets-volume-chart";
import { PageHeader } from "@/components/shared/page-header";
import { useAnalyticsSummary, useTicketsVolume } from "@/hooks/use-analytics";

function formatChartData(points: TicketVolumePoint[]): TicketVolumePoint[] {
  return points.map((p) => ({
    ...p,
    date: new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
}

export default function DashboardPage() {
  const { data: volume, isLoading: volumeLoading } = useTicketsVolume(14);
  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary();

  return (
    <div>
      <PageHeader title="Dashboard" description="A snapshot of what's happening across your team right now." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
        ) : (
          <>
            <StatCard label="Open tickets" value={String(summary.openTickets)} icon={Inbox} />
            <StatCard
              label="Avg. first response"
              value={summary.avgFirstResponseMinutes !== null ? `${summary.avgFirstResponseMinutes}m` : "—"}
              icon={Clock}
            />
            <StatCard label="Resolved today" value={String(summary.resolvedToday)} icon={CheckCircle2} />
            <StatCard label="SLA at risk" value={String(summary.slaAtRisk)} icon={AlertTriangle} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {volumeLoading || !volume ? (
            <Skeleton className="h-[22rem] w-full rounded-lg" />
          ) : (
            <TicketsVolumeChart data={formatChartData(volume)} />
          )}
        </div>
        <RecentTicketsCard />
      </div>
    </div>
  );
}
