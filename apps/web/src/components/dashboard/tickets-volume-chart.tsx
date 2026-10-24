"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TicketVolumePoint {
  date: string;
  created: number;
  resolved: number;
}

export function TicketsVolumeChart({ data }: { data: TicketVolumePoint[] }) {
  const created = data.reduce((n, p) => n + p.created, 0);
  const resolved = data.reduce((n, p) => n + p.resolved, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-sm font-semibold">Ticket volume</CardTitle>
          <p className="text-xs text-muted-foreground">Last {data.length} days</p>
        </div>
        <dl className="flex gap-5 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            <dt className="text-muted-foreground">Created</dt>
            <dd className="tabular font-semibold">{created}</dd>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
            <dt className="text-muted-foreground">Resolved</dt>
            <dd className="tabular font-semibold">{resolved}</dd>
          </div>
        </dl>
      </CardHeader>
      <CardContent className="h-72 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillResolved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.7} vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.4, strokeDasharray: "3 3" }}
              contentStyle={{
                background: "hsl(var(--surface))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 10,
                fontSize: 12,
                boxShadow: "var(--float-shadow)",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: 4 }}
            />
            <Area
              type="monotone"
              dataKey="created"
              stroke="hsl(var(--primary))"
              fill="url(#fillCreated)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Created"
            />
            <Area
              type="monotone"
              dataKey="resolved"
              stroke="hsl(var(--success))"
              fill="url(#fillResolved)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Resolved"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
