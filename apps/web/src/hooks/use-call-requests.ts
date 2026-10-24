import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export type CallStatus = "requested" | "scheduled" | "completed" | "no_answer" | "cancelled";

export interface CallRequestRow {
  id: string;
  phone: string;
  preferredTime: string | null;
  note: string | null;
  status: CallStatus;
  scheduledAt: string | null;
  createdAt: string;
  ticket: { id: string; number: number; subject: string };
}

export function useCallRequests() {
  return useQuery({
    queryKey: ["call-requests"],
    queryFn: () => apiClient.get<CallRequestRow[]>("/api/call-requests?status=open"),
    refetchInterval: 60_000,
  });
}

export function useUpdateCallRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: CallStatus }) => apiClient.patch<CallRequestRow>(`/api/call-requests/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-requests"] }),
  });
}
