"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiStats, useAiTraces, type TraceFilter } from "@/hooks/use-ai-insights";
import { relativeTime } from "@/lib/format";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

const FILTERS: Array<{ id: TraceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "down", label: "Thumbs down" },
  { id: "fallback", label: "AI declined" },
  { id: "low", label: "Low confidence" },
];

export function TracesPanel() {
  const [filter, setFilter] = useState<TraceFilter>("all");
  const [page, setPage] = useState(1);
  const { data: stats } = useAiStats(7);
  const { data, isLoading } = useAiTraces(filter, page);
  const [openId, setOpenId] = useState<string | null>(null);

  const totalPages = data?.meta ? Math.max(1, Math.ceil(data.meta.totalItems / data.meta.pageSize)) : 1;

  const tiles: Array<[string, string]> = stats
    ? [
        ["Suggestions (7d)", String(stats.total)],
        ["Agent approval", pct(stats.satisfactionRate)],
        ["AI declined", pct(stats.fallbackRate)],
        ["Avg confidence", pct(stats.avgConfidence)],
        ["Avg latency", stats.avgLatencyMs === null ? "—" : `${stats.avgLatencyMs} ms`],
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <dl className="grid grid-cols-2 divide-border sm:grid-cols-5 sm:divide-x">
          {stats
            ? tiles.map(([label, value]) => (
                <div key={label} className="px-5 py-4">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</dd>
                </div>
              ))
            : Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="px-5 py-4">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
        </dl>
      </Card>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? "default" : "outline"}
            onClick={() => {
              setFilter(f.id);
              setPage(1);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No AI suggestions match this filter yet.</p>
      ) : (
        <div className="space-y-2">
          {data.data.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 py-3">
                <button type="button" className="w-full text-left" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{t.query || "(no customer message)"}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.feedback === "up" && <ThumbsUp className="h-3.5 w-3.5 text-success" />}
                      {t.feedback === "down" && <ThumbsDown className="h-3.5 w-3.5 text-danger" />}
                      <Badge variant={t.confidence < 0.6 ? "warning" : "ai"}>{Math.round(t.confidence * 100)}%</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {relativeTime(t.createdAt)} · {t.latencyMs} ms
                  </p>
                </button>
                {openId === t.id && (
                  <div className="space-y-3 border-t border-border pt-3 text-sm">
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">AI reply</p>
                      <p className="whitespace-pre-wrap">{t.reply}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Knowledge-base sources used</p>
                      {t.sourceArticles.length === 0 ? (
                        <p className="text-xs text-muted-foreground">None — the AI had nothing relevant to ground on.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {t.sourceArticles.map((a) => (
                            <Badge key={a.article_id} variant="muted" className="font-normal">
                              {a.title} · {Math.round(a.similarity * 100)}%
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {t.feedbackNote && <p className="text-xs text-muted-foreground">Agent note: {t.feedbackNote}</p>}
                    {t.ticketId && (
                      <Link href={`/tickets/${t.ticketId}`} className="text-xs text-primary hover:underline">
                        Open ticket
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
