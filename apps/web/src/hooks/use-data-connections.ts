import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export interface ShopifyStatus {
  connected: boolean;
  shopDomain?: string;
  connectedAt?: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string;
  cancelled: boolean;
  total: string;
  currency: string;
  items: Array<{ title: string; quantity: number }>;
  tracking: Array<{ company: string | null; number: string | null; url: string | null }>;
}

export interface ImportSummary {
  dryRun: boolean;
  totalRows: number;
  valid: number;
  duplicates: number;
  invalid: number;
  toCreate: number;
  created: number;
  failed: number;
  newCustomers: number;
  errors: Array<{ line: number; message: string }>;
}

export function useShopifyStatus() {
  return useQuery({
    queryKey: ["shopify", "status"],
    queryFn: () => apiClient.get<ShopifyStatus>("/api/shopify"),
    staleTime: 60 * 1000,
  });
}

export function useConnectShopify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { shopDomain: string; accessToken: string }) => apiClient.put<ShopifyStatus>("/api/shopify", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopify"] }),
  });
}

export function useDisconnectShopify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete("/api/shopify"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopify"] }),
  });
}

export function useShopifyOrders(email: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["shopify", "orders", email],
    queryFn: () => apiClient.get<ShopifyOrder[]>(`/api/shopify/orders?email=${encodeURIComponent(email ?? "")}`),
    enabled: enabled && Boolean(email),
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useImportTickets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ csv, dryRun }: { csv: string; dryRun: boolean }) =>
      apiClient.postText<ImportSummary>(`/api/imports/tickets?dryRun=${dryRun}`, csv),
    onSuccess: (data) => {
      if (!data.dryRun) {
        void qc.invalidateQueries({ queryKey: ["tickets"] });
        void qc.invalidateQueries({ queryKey: ["customers"] });
      }
    },
  });
}
