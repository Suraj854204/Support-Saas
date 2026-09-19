import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Customer, TicketPriority, TicketStatus } from "@support-saas/shared-types";

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ["customers", search ?? ""],
    queryFn: () =>
      apiClient.get<Customer[]>(`/api/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    staleTime: 30 * 1000,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; email?: string }) => apiClient.post<Customer>("/api/customers", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export interface CustomerTicketSummary {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends Customer {
  stats: { totalTickets: number; openTickets: number; lastInteraction: string };
  tickets: CustomerTicketSummary[];
}

export function useCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customers", "detail", customerId],
    queryFn: () => apiClient.get<CustomerDetail>(`/api/customers/${customerId}`),
    enabled: Boolean(customerId),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string } & Partial<Pick<Customer, "name" | "phone" | "tags" | "isVip" | "isBlocked">>) =>
      apiClient.patch<Customer>(`/api/customers/${id}`, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customers", "detail", variables.id] });
    },
  });
}

export function useMergeCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetCustomerId }: { id: string; targetCustomerId: string }) =>
      apiClient.post<CustomerDetail>(`/api/customers/${id}/merge`, { targetCustomerId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useExportCustomer() {
  return useMutation({
    mutationFn: (customerId: string) => apiClient.get(`/api/customers/${customerId}/export`),
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) => apiClient.delete<Customer>(`/api/customers/${customerId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}
