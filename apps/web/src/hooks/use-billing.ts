import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export type PlanTier = "free" | "starter" | "growth" | "enterprise";

/** null = unlimited */
export interface PlanLimits {
  seats: number | null;
  aiRepliesPerMonth: number | null;
  articles: number | null;
  forms: number | null;
}

export interface InvoiceRow {
  id: string;
  number: string | null;
  createdAt: string;
  status: string | null;
  currency: string;
  /** minor units (paise) */
  total: number;
  amountPaid: number;
  tax: number;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
}

export interface BillingOverview {
  billingEnabled: boolean;
  gstNote: string;
  plan: { tier: PlanTier; name: string; limits: PlanLimits; priceInr: number };
  overage: {
    offered: boolean;
    available: boolean;
    enabled: boolean;
    ratePerReplyInr: number | null;
    capUnits: number | null;
    usedUnits: number;
    estimatedChargeInr: number;
  };
  usage: { seats: number; articles: number; forms: number; aiReplies: number };
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasPaymentMethodOnFile: boolean;
  } | null;
  plans: {
    tier: PlanTier;
    name: string;
    limits: PlanLimits;
    selfServe: boolean;
    purchasable: boolean;
    priceInr: number;
    introPriceInr: number | null;
    overageInrPerReply: number | null;
    renewalNeedsApproval: boolean;
  }[];
}

/** `poll` re-reads every 3 s right after Checkout, while Stripe's webhook is still on its way. */
export function useBilling(poll = false) {
  return useQuery({
    queryKey: ["billing"],
    queryFn: () => apiClient.get<BillingOverview>("/api/billing"),
    refetchInterval: poll ? 3000 : false,
  });
}

export function useCheckout() {
  return useMutation({ mutationFn: (plan: "starter" | "growth" | "enterprise") => apiClient.post<{ url: string }>("/api/billing/checkout", { plan }) });
}

export function usePortal() {
  return useMutation({ mutationFn: () => apiClient.post<{ url: string }>("/api/billing/portal", {}) });
}

export function useInvoices(enabled: boolean) {
  return useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => apiClient.get<InvoiceRow[]>("/api/billing/invoices"),
    enabled,
  });
}

export function useSetOverage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => apiClient.patch<{ enabled: boolean }>("/api/billing/overage", { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  });
}
