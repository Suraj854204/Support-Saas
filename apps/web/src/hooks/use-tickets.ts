import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Ticket, TicketMessage, TicketPriority, TicketStatus } from "@support-saas/shared-types";

export interface TicketWithRelations extends Ticket {
  customer: { id: string; name: string | null; email: string | null };
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface TicketDetail extends TicketWithRelations {
  team: { id: string; name: string } | null;
  messages: TicketMessage[];
}

export interface ListTicketsParams {
  page?: number;
  pageSize?: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "priority";
  sortOrder?: "asc" | "desc";
}

function toQueryString(params: ListTicketsParams): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useTickets(params: ListTicketsParams) {
  return useQuery({
    queryKey: ["tickets", params],
    queryFn: () => apiClient.getPaginated<TicketWithRelations[]>(`/api/tickets${toQueryString(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["tickets", ticketId],
    queryFn: () => apiClient.get<TicketDetail>(`/api/tickets/${ticketId}`),
    enabled: Boolean(ticketId),
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Ticket>) =>
      apiClient.patch<Ticket>(`/api/tickets/${id}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets", variables.id] });
    },
  });
}

export interface TicketMessageInput {
  ticketId: string;
  body: string;
  bodyFormat?: "text" | "html" | "markdown";
  isInternalNote?: boolean;
}

export function useAddTicketMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, ...data }: TicketMessageInput) =>
      apiClient.post(`/api/tickets/${ticketId}/messages`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tickets", variables.ticketId] });
    },
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { subject: string; customerId: string; priority?: TicketPriority; initialMessage?: string }) =>
      apiClient.post<Ticket>("/api/tickets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
