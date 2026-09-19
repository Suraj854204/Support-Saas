import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export interface CannedResponse {
  id: string;
  orgId: string;
  name: string;
  body: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export function useCannedResponses() {
  return useQuery({
    queryKey: ["canned-responses"],
    queryFn: () => apiClient.get<CannedResponse[]>("/api/canned-responses"),
    staleTime: 60 * 1000,
  });
}

export function useCreateCannedResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; body: string }) =>
      apiClient.post<CannedResponse>("/api/canned-responses", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["canned-responses"] }),
  });
}

export function useUpdateCannedResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; body?: string }) =>
      apiClient.patch<CannedResponse>(`/api/canned-responses/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["canned-responses"] }),
  });
}

export function useDeleteCannedResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/canned-responses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["canned-responses"] }),
  });
}
