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

export interface InviteMemberInput {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteMemberInput) => apiClient.post<User>("/api/users", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
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
