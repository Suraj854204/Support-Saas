import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Customer } from "@support-saas/shared-types";

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
