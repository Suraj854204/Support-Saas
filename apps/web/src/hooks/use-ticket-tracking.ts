import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { TicketPriority, TicketStatus } from "@support-saas/shared-types";

export interface PublicTrackingMessage {
  id: string;
  authorType: "customer" | "agent";
  body: string;
  createdAt: string;
}

export interface PublicTicketTracking {
  ticketNumber: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  timeline: PublicTrackingMessage[];
}

export function useTicketTracking(token: string) {
  return useQuery({
    queryKey: ["ticket-tracking", token],
    queryFn: () => apiClient.get<PublicTicketTracking>(`/api/ticket-tracking/${token}`, { skipAuth: true }),
    retry: false,
  });
}

export function useSubmitTrackingReply(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiClient.post<PublicTicketTracking>(`/api/ticket-tracking/${token}/reply`, { body }, { skipAuth: true }),
    onSuccess: (data) => {
      queryClient.setQueryData(["ticket-tracking", token], data);
    },
  });
}
