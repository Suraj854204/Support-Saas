import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { KnowledgeArticle } from "@support-saas/shared-types";

export function useArticles() {
  return useQuery({
    queryKey: ["knowledge"],
    queryFn: () => apiClient.get<KnowledgeArticle[]>("/api/knowledge"),
  });
}

export interface CreateArticleInput {
  title: string;
  content: string;
  tags: string[];
  status: "draft" | "published" | "archived";
}

export function useCreateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateArticleInput) => apiClient.post<KnowledgeArticle>("/api/knowledge", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
  });
}

export function useUpdateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CreateArticleInput> & { id: string }) =>
      apiClient.patch<KnowledgeArticle>(`/api/knowledge/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
  });
}

export function useDeleteArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/knowledge/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
  });
}
