import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export type MacroStatus = "open" | "pending" | "on_hold" | "solved" | "closed";
export type MacroPriority = "low" | "normal" | "high" | "urgent";

export interface Macro {
  id: string;
  name: string;
  replyBody: string | null;
  setStatus: MacroStatus | null;
  setPriority: MacroPriority | null;
  addTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MacroInput {
  name: string;
  replyBody?: string | null;
  setStatus?: MacroStatus | null;
  setPriority?: MacroPriority | null;
  addTags?: string[];
}

export function useMacros(enabled = true) {
  return useQuery({
    queryKey: ["macros"],
    queryFn: () => apiClient.get<Macro[]>("/api/macros"),
    staleTime: 60 * 1000,
    enabled,
    retry: false,
  });
}

export function useCreateMacro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MacroInput) => apiClient.post<Macro>("/api/macros", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["macros"] }),
  });
}

export function useDeleteMacro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/macros/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["macros"] }),
  });
}

export function useApplyMacro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ macroId, ticketId }: { macroId: string; ticketId: string }) =>
      apiClient.post<{ replied: boolean; changed: string[] }>(`/api/macros/${macroId}/apply`, { ticketId }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["tickets", v.ticketId] });
    },
  });
}
