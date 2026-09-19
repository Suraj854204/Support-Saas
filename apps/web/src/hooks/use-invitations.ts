import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import { useAppDispatch } from "@/store";
import { setCredentials } from "@/store/slices/auth-slice";
import type { User, UserRole } from "@support-saas/shared-types";

export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  role: UserRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedById: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function useInvitations() {
  return useQuery({
    queryKey: ["invitations"],
    queryFn: () => apiClient.get<Invitation[]>("/api/orgs/invitations"),
    staleTime: 60 * 1000,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; role: UserRole }) =>
      apiClient.post<Invitation>("/api/orgs/invitations", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => apiClient.delete(`/api/orgs/invitations/${invitationId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });
}

export function useAcceptInvitation() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  return useMutation({
    mutationFn: (input: { token: string; name: string; password: string }) =>
      apiClient.post<{ user: User; accessToken: string }>("/api/auth/accept-invitation", input, {
        skipAuth: true,
      }),
    onSuccess: (data) => {
      dispatch(setCredentials(data));
      router.push("/dashboard");
    },
  });
}
