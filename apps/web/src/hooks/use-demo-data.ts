import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export function useDemoDataStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["demo-data"],
    queryFn: () => apiClient.get<{ active: boolean; tickets: number }>("/api/demo-data"),
    enabled,
    retry: false,
  });
}

function useRefreshAll() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["demo-data", "tickets", "customers", "analytics"]) qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useLoadDemoData() {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: () => apiClient.post<{ tickets: number }>("/api/demo-data", {}), onSuccess: refresh });
}

export function useClearDemoData() {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: () => apiClient.delete<{ tickets: number; customers: number }>("/api/demo-data"), onSuccess: refresh });
}
