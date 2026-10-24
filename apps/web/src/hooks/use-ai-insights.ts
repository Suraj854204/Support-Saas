import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SourceArticle } from "@/hooks/use-ai-suggestion";
import { apiClient } from "@/lib/api-client";

export interface AiStats {
  days: number;
  total: number;
  rated: number;
  up: number;
  down: number;
  satisfactionRate: number | null;
  fallbackCount: number;
  fallbackRate: number | null;
  lowConfidenceCount: number;
  avgConfidence: number | null;
  avgLatencyMs: number | null;
}

export interface AiTraceRow {
  id: string;
  ticketId: string | null;
  query: string;
  reply: string;
  confidence: number;
  sourceArticles: SourceArticle[];
  latencyMs: number;
  messageCount: number;
  feedback: "up" | "down" | null;
  feedbackNote: string | null;
  createdAt: string;
}

export interface EvalCaseRow {
  id: string;
  question: string;
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  expectFallback: boolean;
}

export interface EvalResultRow {
  caseId: string;
  question: string;
  reply: string;
  confidence: number;
  passed: boolean;
  reasons: string[];
}

export interface EvalRunRow {
  id: string;
  total: number;
  passed: number;
  avgConfidence: number;
  avgLatencyMs: number;
  /** Only present on a freshly executed run; the history list omits it. */
  results?: EvalResultRow[];
  createdAt: string;
}

export type TraceFilter = "all" | "down" | "fallback" | "low";

export function useAiStats(days: number, enabled = true) {
  return useQuery({
    queryKey: ["ai-insights", "stats", days],
    queryFn: () => apiClient.get<AiStats>(`/api/ai-insights/stats?days=${days}`),
    enabled,
    retry: false,
  });
}

export function useAiTraces(filter: TraceFilter, page: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (filter === "down") params.set("feedback", "down");
  if (filter === "fallback") params.set("fallbackOnly", "true");
  if (filter === "low") params.set("lowConfidenceOnly", "true");
  return useQuery({
    queryKey: ["ai-insights", "traces", filter, page],
    queryFn: () => apiClient.getPaginated<AiTraceRow[]>(`/api/ai-insights/traces?${params}`),
  });
}

export function useTraceFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, feedback, note }: { id: string; feedback: "up" | "down"; note?: string }) =>
      apiClient.post<AiTraceRow>(`/api/ai-insights/traces/${id}/feedback`, { feedback, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights"] }),
  });
}

export function useEvalCases() {
  return useQuery({ queryKey: ["ai-insights", "eval-cases"], queryFn: () => apiClient.get<EvalCaseRow[]>("/api/ai-insights/eval/cases") });
}

export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<EvalCaseRow, "id">) => apiClient.post<EvalCaseRow>("/api/ai-insights/eval/cases", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights", "eval-cases"] }),
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/ai-insights/eval/cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights", "eval-cases"] }),
  });
}

export function useEvalRuns() {
  return useQuery({ queryKey: ["ai-insights", "eval-runs"], queryFn: () => apiClient.get<EvalRunRow[]>("/api/ai-insights/eval/runs") });
}

export function useRunEval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<EvalRunRow>("/api/ai-insights/eval/runs"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights", "eval-runs"] }),
  });
}
