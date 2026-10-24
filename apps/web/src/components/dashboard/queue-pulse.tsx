import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Metric {
  label: string;
  value: string;
  hint?: string;
}

/**
 * The dashboard's one loud element: how big the queue is and how much of it is
 * close to breaching SLA, read in a single glance. Everything else on the page
 * stays quiet around it.
 */
export function QueuePulse({
  open,
  atRisk,
  metrics,
}: {
  open: number;
  atRisk: number;
  metrics: Metric[];
}) {
  const risk = Math.min(atRisk, open);
  const onTrack = open - risk;
  const riskPct = open === 0 ? 0 : (risk / open) * 100;

  return (
    <Card className="grid overflow-hidden lg:grid-cols-[1.35fr_1fr]">
      <div className="p-6 sm:p-7">
        <p className="text-sm text-muted-foreground">Open tickets</p>
        <p className="tabular mt-1 text-6xl font-semibold leading-none tracking-tight sm:text-7xl">{open}</p>

        {open === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">The queue is clear. New conversations will appear here.</p>
        ) : (
          <>
            <div
              className="mt-8 flex h-3 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${onTrack} on track, ${risk} at risk of breaching SLA`}
            >
              <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${100 - riskPct}%` }} />
              <div className="h-full bg-warning transition-[width] duration-500" style={{ width: `${riskPct}%` }} />
            </div>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                <dt className="text-muted-foreground">On track</dt>
                <dd className="tabular font-medium">{onTrack}</dd>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
                <dt className="text-muted-foreground">SLA at risk</dt>
                <dd className={cn("tabular font-medium", risk > 0 && "text-warning")}>{risk}</dd>
              </div>
            </dl>
          </>
        )}
      </div>

      <dl className="grid divide-y divide-border border-t border-border lg:border-l lg:border-t-0">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-4 px-6 py-4 sm:px-7">
            <div>
              <dt className="text-sm font-medium">{m.label}</dt>
              {m.hint && <p className="text-xs text-muted-foreground">{m.hint}</p>}
            </div>
            <dd className="tabular text-2xl font-semibold tracking-tight">{m.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
