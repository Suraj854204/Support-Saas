import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export const API_KEY_SCOPES = ["tickets:read", "tickets:write"] as const;
export const WEBHOOK_EVENTS = [
  "ticket.created",
  "ticket.updated",
  "ticket.assigned",
  "ticket.resolved",
  "message.sent",
  "customer.reply.received",
] as const;

export interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface WebhookRow {
  id: string;
  url: string;
  description: string | null;
  format: "json" | "slack";
  events: string[];
  isActive: boolean;
  disabledReason: string | null;
  createdAt: string;
}

export interface DeliveryRow {
  id: string;
  eventId: string;
  eventType: string;
  status: "pending" | "delivered" | "dead";
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  lastStatusCode: number | null;
  deliveredAt: string | null;
  createdAt: string;
}

export function useApiKeys() {
  return useQuery({ queryKey: ["api-keys"], queryFn: () => apiClient.get<ApiKeyRow[]>("/api/api-keys") });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; scopes: string[]; expiresInDays?: number }) =>
      apiClient.post<{ key: string; apiKey: ApiKeyRow }>("/api/api-keys", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useWebhooks() {
  return useQuery({ queryKey: ["webhooks"], queryFn: () => apiClient.get<WebhookRow[]>("/api/webhooks") });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { url: string; description?: string; format: "json" | "slack"; events: string[] }) =>
      apiClient.post<{ secret: string; endpoint: WebhookRow }>("/api/webhooks", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; isActive?: boolean }) => apiClient.patch<WebhookRow>(`/api/webhooks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useRotateWebhookSecret() {
  return useMutation({ mutationFn: (id: string) => apiClient.post<{ secret: string }>(`/api/webhooks/${id}/rotate-secret`) });
}

export function useSendTestWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<unknown>(`/api/webhooks/${id}/test`),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: ["webhook-deliveries", id] }),
  });
}

export function useWebhookDeliveries(id: string | null) {
  return useQuery({
    queryKey: ["webhook-deliveries", id],
    queryFn: () => apiClient.get<DeliveryRow[]>(`/api/webhooks/${id}/deliveries`),
    enabled: Boolean(id),
  });
}

export function useRetryDelivery(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => apiClient.post<unknown>(`/api/webhooks/deliveries/${deliveryId}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-deliveries", endpointId] }),
  });
}
