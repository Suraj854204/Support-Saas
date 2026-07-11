import { useMutation } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export interface SourceArticle {
  article_id: string;
  title: string;
  similarity: number;
}

export interface AiSuggestion {
  suggested_reply: string;
  confidence: number;
  source_articles: SourceArticle[];
}

export function useAiSuggestion(ticketId: string) {
  return useMutation({
    mutationFn: () => apiClient.post<AiSuggestion>(`/api/tickets/${ticketId}/ai-suggest`),
  });
}
