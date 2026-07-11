import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export interface TeamMemberWithUser {
  teamId: string;
  userId: string;
  joinedAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface TeamWithMembers {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
  members: TeamMemberWithUser[];
}

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => apiClient.get<TeamWithMembers[]>("/api/teams"),
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiClient.post("/api/teams", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => apiClient.delete(`/api/teams/${teamId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      apiClient.post(`/api/teams/${teamId}/members`, { userId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      apiClient.delete(`/api/teams/${teamId}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}
