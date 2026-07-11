"use client";

import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceRing } from "@/components/tickets/confidence-ring";
import type { AiSuggestion } from "@/hooks/use-ai-suggestion";

export function AiSuggestionCard({
  suggestion,
  onUse,
  onDismiss,
}: {
  suggestion: AiSuggestion;
  onUse: () => void;
  onDismiss: () => void;
}) {
  const confidencePct = Math.round(suggestion.confidence * 100);

  return (
    <div className="mx-3 mb-2 rounded-lg border border-ai/30 bg-ai/5 p-3">
      <div className="flex items-start gap-3">
        <ConfidenceRing value={confidencePct} tone="ai" size={32}>
          <span className="font-mono text-[9px] font-medium text-ai">{confidencePct}%</span>
        </ConfidenceRing>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ai">
            <Sparkles className="h-3 w-3" /> AI suggested reply
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{suggestion.suggested_reply}</p>
          {suggestion.source_articles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestion.source_articles.map((a) => (
                <Badge key={a.article_id} variant="muted" className="font-normal">
                  {a.title}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button size="sm" onClick={onUse}>
          Use this reply
        </Button>
      </div>
    </div>
  );
}
