"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { AutomationRule } from "@/hooks/use-automations";
import { useAutomationRunLogs, useDeleteAutomationRule, useUpdateAutomationRule } from "@/hooks/use-automations";
import { ApiRequestError } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

const TRIGGER_LABELS: Record<string, string> = {
  ticket_created: "Ticket created",
  customer_replied: "Customer replied",
  status_changed: "Status changed",
  ticket_reopened: "Ticket reopened",
  sla_approaching: "SLA approaching",
  sla_breached: "SLA breached",
  ticket_inactive: "Ticket inactive",
};

export function AutomationRuleCard({ rule }: { rule: AutomationRule }) {
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const [showLogs, setShowLogs] = useState(false);
  const { data: logs, isLoading: logsLoading } = useAutomationRunLogs(showLogs ? rule.id : undefined);

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{rule.name}</p>
            <Badge variant="muted" className="mt-1 text-[10px]">
              {TRIGGER_LABELS[rule.trigger] ?? rule.trigger}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={rule.isActive}
              onCheckedChange={(checked) =>
                updateRule.mutate(
                  { id: rule.id, isActive: checked },
                  { onError: () => toast.error("Couldn't update rule.") }
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                deleteRule.mutate(rule.id, {
                  onSuccess: () => toast.success("Rule deleted"),
                  onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't delete rule."),
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </Button>
          </div>
        </div>

        {rule.conditions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            When {rule.conditions.map((c) => `${c.field.replace("_", " ")} ${c.operator} "${c.value}"`).join(" and ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Then: {rule.actions.map((a) => `${a.type.replace("_", " ")} "${a.value.slice(0, 40)}"`).join(", ")}
        </p>

        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          onClick={() => setShowLogs((s) => !s)}
        >
          {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Recent activity
        </button>

        {showLogs && (
          <div className="space-y-1.5 border-t pt-2">
            {logsLoading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : !logs || logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">This rule hasn't fired yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {Object.keys(log.actionsApplied).join(", ") || "no actions applied"}
                  </span>
                  <span className="text-muted-foreground">{relativeTime(log.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
