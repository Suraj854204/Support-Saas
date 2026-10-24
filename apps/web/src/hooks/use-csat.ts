import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { PublicTicketTracking } from "@/hooks/use-ticket-tracking";

export interface CsatSummary {
  days: number;
  responses: number;
  average: number | null;
  satisfiedPercent: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  recent: { ticketNumber: number; subject: string; rating: number; comment: string | null; createdAt: string }[];
}

export function useCsatSummary(days = 30) {
  return useQuery({
    queryKey: ["csat", "summary", days],
    queryFn: () => apiClient.get<CsatSummary>(`/api/csat/summary?days=${days}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Customer-side: rate a resolved request from the tracking link (no login). */
export function useSubmitRating(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { rating: number; comment?: string }) =>
      apiClient.post<PublicTicketTracking>(`/api/ticket-tracking/${token}/rating`, v, { skipAuth: true }),
    onSuccess: (data) => qc.setQueryData(["ticket-tracking", token], data),
  });
}
