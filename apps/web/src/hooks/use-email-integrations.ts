import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export interface EmailConnectionSettings {
  autoCreateTickets: boolean;
  syncEnabled: boolean;
}

export interface EmailConnection {
  id: string;
  orgId: string;
  provider: "gmail";
  email: string;
  scopes: string[];
  syncStatus: "idle" | "syncing" | "error" | "disconnected";
  lastSyncedAt: string | null;
  lastError: string | null;
  isActive: boolean;
  settings: EmailConnectionSettings;
  connectedById: string;
  createdAt: string;
  updatedAt: string;
}

const QUERY_KEY = ["email-connections"];

export function useEmailConnections() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiClient.get<EmailConnection[]>("/api/integrations/email"),
    staleTime: 30 * 1000,
  });
}

/** Kicks off the Gmail OAuth flow — on success, redirect the browser to the returned authUrl. */
export function useConnectGmail() {
  return useMutation({
    mutationFn: () => apiClient.post<{ authUrl: string }>("/api/integrations/gmail/connect"),
  });
}

export function useSyncGmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ processed: number; skipped: number; failed: number }>("/api/integrations/gmail/sync"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDisconnectGmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<EmailConnection>("/api/integrations/email"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateEmailSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<EmailConnectionSettings>) =>
      apiClient.patch<EmailConnection>("/api/integrations/email/settings", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
