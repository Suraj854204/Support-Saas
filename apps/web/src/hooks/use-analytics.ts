import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketVolumePoint } from "@/components/dashboard/tickets-volume-chart";

export function useTicketsVolume(days = 14) {
  return useQuery({
    queryKey: ["analytics", "tickets-volume", days],
    queryFn: () => apiClient.get<TicketVolumePoint[]>(`/api/analytics/tickets-volume?days=${days}`),
    staleTime: 60 * 1000,
  });
}

export interface AnalyticsSummary {
  openTickets: number;
  resolvedToday: number;
  avgFirstResponseMinutes: number | null;
  slaAtRisk: number;
}

export function useAnalyticsSummary() {
  return useQuery({
    queryKey: ["analytics", "summary"],
    queryFn: () => apiClient.get<AnalyticsSummary>("/api/analytics/summary"),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000, // keep the dashboard reasonably live without a socket subscription
  });
}
