"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/hooks/use-auth";
import { useUpdateUserCapacity, useWorkloads } from "@/hooks/use-users";
import { initials, relativeTime } from "@/lib/format";

export function WorkloadsPanel() {
  const { data: currentUser } = useCurrentUser();
  const { data: workloads } = useWorkloads();
  const updateCapacity = useUpdateUserCapacity();
  const [editingId, setEditingId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  if (!isAdmin || !workloads || workloads.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Workloads</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {workloads.map((w) => {
          const overCapacity = w.weeklyCapacity !== null && w.openTicketCount > w.weeklyCapacity;
          return (
            <div key={w.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={w.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs">{initials(w.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.lastSeenAt ? `Active ${relativeTime(w.lastSeenAt)}` : "Never signed in"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link href={`/tickets?assigneeId=${w.id}`} className="hover:underline">
                  <Badge variant={overCapacity ? "danger" : "muted"}>{w.openTicketCount} open</Badge>
                </Link>

                {editingId === w.id ? (
                  <Input
                    type="number"
                    autoFocus
                    className="h-7 w-16 text-xs"
                    defaultValue={w.weeklyCapacity ?? ""}
                    onBlur={(e) => {
                      const value = e.target.value === "" ? null : Number(e.target.value);
                      updateCapacity.mutate({ userId: w.id, weeklyCapacity: value });
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => setEditingId(w.id)}
                  >
                    Capacity: {w.weeklyCapacity ?? "—"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
