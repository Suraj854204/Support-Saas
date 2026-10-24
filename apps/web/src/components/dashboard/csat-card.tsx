"use client";

import { Star } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCsatSummary } from "@/hooks/use-csat";

export function CsatCard() {
  const { data, isLoading, isError } = useCsatSummary(30);
  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (isError || !data) return null;

  const max = Math.max(1, ...Object.values(data.distribution));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-4 w-4" /> Customer satisfaction <span className="text-xs font-normal text-muted-foreground">last {data.days} days</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.responses === 0 ? (
          <p className="text-sm text-muted-foreground">No ratings yet. Customers can rate a request from their tracking link once it is resolved.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div>
              <p className="text-3xl font-semibold tabular-nums">
                {data.average?.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground"> / 5</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {data.satisfiedPercent}% satisfied · {data.responses} {data.responses === 1 ? "rating" : "ratings"}
              </p>
            </div>
            <ul className="space-y-1" aria-label="Rating distribution">
              {(["5", "4", "3", "2", "1"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-3 tabular-nums">{k}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(data.distribution[k] / max) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right tabular-nums text-muted-foreground">{data.distribution[k]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.recent.some((r) => r.comment) && (
          <ul className="mt-4 space-y-2 border-t pt-3 text-sm">
            {data.recent
              .filter((r) => r.comment)
              .slice(0, 3)
              .map((r) => (
                <li key={`${r.ticketNumber}-${r.createdAt}`}>
                  <span className="text-xs text-muted-foreground">
                    #{r.ticketNumber} · {r.rating}★ ·{" "}
                  </span>
                  {r.comment}
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
