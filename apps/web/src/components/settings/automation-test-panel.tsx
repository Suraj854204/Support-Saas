"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSimulateRule } from "@/hooks/use-automations";
import { useTickets } from "@/hooks/use-tickets";
import { ApiRequestError } from "@/lib/api-client";
import { describeAction, describeCondition } from "@/lib/automation-labels";
import { ticketRef } from "@/lib/format";

/** Dry run: pick a real ticket and see whether the rule would fire and why. Nothing is changed or sent. */
export function AutomationTestPanel({ ruleId }: { ruleId: string }) {
  const { data } = useTickets({ page: 1, pageSize: 20, sortBy: "updatedAt", sortOrder: "desc" });
  const simulate = useSimulateRule();
  const [ticketId, setTicketId] = useState("");

  const result = simulate.data;

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">Pick a ticket to see if this rule would fire. Nothing is changed or sent.</p>
      <div className="flex items-center gap-2">
        <Select value={ticketId} onValueChange={setTicketId}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Choose a recent ticket" />
          </SelectTrigger>
          <SelectContent>
            {data?.data.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {ticketRef(t.number)} · {t.subject.slice(0, 50)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!ticketId || simulate.isPending}
          onClick={() =>
            simulate.mutate(
              { ruleId, ticketId },
              { onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't run the test.") }
            )
          }
        >
          {simulate.isPending ? "Testing..." : "Run test"}
        </Button>
      </div>

      {result && (
        <div className="space-y-2 text-xs">
          <p className={result.wouldMatch ? "font-medium text-success" : "font-medium text-warning"}>
            {result.wouldMatch ? "This rule would fire on that ticket." : "This rule would not fire on that ticket."}
          </p>
          {result.conditions.length === 0 ? (
            <p className="text-muted-foreground">No conditions, so it matches every ticket for this trigger.</p>
          ) : (
            <ul className="space-y-1">
              {result.conditions.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  {c.matched ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                  )}
                  <span>{describeCondition(c)}</span>
                </li>
              ))}
            </ul>
          )}
          {result.wouldMatch && result.actions.length > 0 && (
            <p className="text-muted-foreground">Would then: {result.actions.map(describeAction).join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
