import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Ticket, TicketChannel, TicketMessage, TicketPriority, TicketStatus } from "@support-saas/shared-types";

export interface TicketWithRelations extends Ticket {
  customer: { id: string; name: string | null; email: string | null };
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  isUnread: boolean;
}

export interface InboundEmailSummary {
  id: string;
  gmailMessageId: string;
  gmailThreadId: string;
  senderEmail: string;
  subject: string | null;
  attachments: { filename: string; mimeType: string; sizeBytes: number; blocked: boolean }[];
  receivedAt: string;
}

export interface TicketAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TicketDetail extends TicketWithRelations {
  team: { id: string; name: string } | null;
  messages: TicketMessage[];
  inboundEmailMessages: InboundEmailSummary[];
  attachments: TicketAttachment[];
}

export interface ListTicketsParams {
  page?: number;
  pageSize?: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  channel?: TicketChannel;
  teamId?: string;
  assigneeId?: string;
  unassigned?: boolean;
  createdFrom?: string;
  createdTo?: string;
  unreadOnly?: boolean;
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

export interface BulkUpdateInput {
  ticketIds: string[];
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string | null;
  teamId?: string | null;
}

export interface BulkUpdateResult {
  ticketId: string;
  success: boolean;
  error?: string;
}

export function useBulkUpdateTickets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUpdateInput) => apiClient.patch<BulkUpdateResult[]>("/api/tickets/bulk-update", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tickets"] }),
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

export interface RelatedTicket {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  createdAt: string;
}

export function useRelatedTickets(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["tickets", ticketId, "related"],
    queryFn: () => apiClient.get<RelatedTicket[]>(`/api/tickets/${ticketId}/related`),
    enabled: Boolean(ticketId),
  });
}

export interface TicketNotification {
  id: string;
  eventType: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  lastError: string | null;
  processedAt: string | null;
  createdAt: string;
}

export function useTicketNotifications(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["tickets", ticketId, "notifications"],
    queryFn: () => apiClient.get<TicketNotification[]>(`/api/tickets/${ticketId}/notifications`),
    enabled: Boolean(ticketId),
  });
}

export interface TicketAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function useTicketAuditHistory(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["tickets", ticketId, "audit"],
    queryFn: () => apiClient.get<TicketAuditEntry[]>(`/api/tickets/${ticketId}/audit`),
    enabled: Boolean(ticketId),
    retry: false,
  });
}

export function useRegenerateTrackingLink() {
  return useMutation({
    mutationFn: (ticketId: string) => apiClient.post<{ trackingUrl: string }>(`/api/tickets/${ticketId}/tracking-link`),
  });
}

export function useDownloadAttachment() {
  return useMutation({
    mutationFn: async ({ id, filename }: { id: string; filename: string }) => {
      const blob = await apiClient.downloadBlob(`/api/attachments/${id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}
