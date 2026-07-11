import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Organization } from "@support-saas/shared-types";

export function useCurrentOrg() {
  return useQuery({
    queryKey: ["orgs", "current"],
    queryFn: () => apiClient.get<Organization>("/api/orgs/current"),
  });
}

export function useUpdateOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; domain?: string | null }) =>
      apiClient.patch<Organization>("/api/orgs/current", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orgs", "current"] }),
  });
}
