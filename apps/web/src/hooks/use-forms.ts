import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export interface IntakeFormRow {
  id: string;
  name: string;
  publicKey: string;
  allowedOrigins: string[];
  isActive: boolean;
  source: "web" | "google_form" | "assistant";
  googleFormUrl: string | null;
  createdAt: string;
  submissions: number;
}

export interface FormSubmission {
  id: string;
  number: number;
  subject: string;
  status: "open" | "pending" | "on_hold" | "solved" | "closed";
  priority: string;
  createdAt: string;
  customer: { id: string; name: string | null; email: string };
  formName: string | null;
  formId: string | null;
  preview: string;
  escalation: { level: "high" | "critical"; contacted: boolean; contactDueAt: string } | null;
}

export interface SubmissionFilters {
  formId?: string;
  status?: string;
  search?: string;
  withinHours?: number;
  page: number;
}

export function useForms() {
  return useQuery({ queryKey: ["forms"], queryFn: () => apiClient.get<IntakeFormRow[]>("/api/forms") });
}

export function useFormSubmissions(f: SubmissionFilters) {
  const qs = new URLSearchParams({ page: String(f.page), pageSize: "20" });
  if (f.formId) qs.set("formId", f.formId);
  if (f.status) qs.set("status", f.status);
  if (f.search) qs.set("search", f.search);
  if (f.withinHours) qs.set("withinHours", String(f.withinHours));
  return useQuery({
    queryKey: ["forms", "submissions", f],
    queryFn: () => apiClient.getPaginated<FormSubmission[]>(`/api/forms/submissions?${qs}`),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
}

export function useCreateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { name: string; allowedOrigins: string[]; source: "web" | "google_form" | "assistant"; googleFormUrl?: string }) => apiClient.post<IntakeFormRow>("/api/forms", d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }),
  });
}

export function useUpdateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: { id: string; name?: string; allowedOrigins?: string[]; isActive?: boolean }) =>
      apiClient.patch<IntakeFormRow>(`/api/forms/${id}`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }),
  });
}

export function useDeleteForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/forms/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }),
  });
}
