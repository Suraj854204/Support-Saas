import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export type EscalationState = "open" | "overdue" | "done" | "all";

export interface EscalationRow {
  id: string;
  level: "high" | "critical";
  reasons: string[];
  contactDueAt: string;
  preferredMethod: "call" | "message" | null;
  contactedAt: string | null;
  contactMethod: "call" | "message" | null;
  contactNote: string | null;
  createdAt: string;
  overdue: boolean;
  ticket: { id: string; number: number; subject: string; status: string; preview: string };
  customer: { name: string | null; email: string; phone: string | null };
}

export function useEscalations(state: EscalationState) {
  return useQuery({
    queryKey: ["escalations", state],
    queryFn: () => apiClient.get<EscalationRow[]>(`/api/escalations?state=${state}`),
    refetchInterval: 60_000,
  });
}

export function useEscalationSummary() {
  return useQuery({
    queryKey: ["escalations", "summary"],
    queryFn: () => apiClient.get<{ pending: number; overdue: number }>("/api/escalations/summary"),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

export function useLogContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, method, note }: { id: string; method: "call" | "message"; note?: string }) =>
      apiClient.post(`/api/escalations/${id}/contact`, { method, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["escalations"] }),
  });
}
