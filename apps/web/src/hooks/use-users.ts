import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { User, UserRole } from "@support-saas/shared-types";

export function useOrgUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => apiClient.get<User[]>("/api/users"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      apiClient.patch<User>(`/api/users/${userId}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.delete<User>(`/api/users/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiClient.post<User>(`/api/users/${userId}/reactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUserCapacity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      ...data
    }: {
      userId: string;
      weeklyCapacity?: number | null;
      timezone?: string | null;
    }) => apiClient.patch<User>(`/api/users/${userId}/capacity`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export interface Workload {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  weeklyCapacity: number | null;
  lastSeenAt: string | null;
  openTicketCount: number;
}

export function useWorkloads() {
  return useQuery({
    queryKey: ["users", "workloads"],
    queryFn: () => apiClient.get<Workload[]>("/api/users/workloads/all"),
  });
}
