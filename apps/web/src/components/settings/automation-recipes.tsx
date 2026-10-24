"use client";

import { Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateAutomationRule, type AutomationAction, type AutomationCondition, type AutomationTrigger } from "@/hooks/use-automations";
import { ApiRequestError } from "@/lib/api-client";

interface Recipe {
  name: string;
  summary: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  triggerConfig?: Record<string, string | number>;
}

// Recipes avoid org-specific ids so they work in any workspace. They are added switched off for review.
const RECIPES: Recipe[] = [
  {
    name: "Auto-assign new tickets",
    summary: "Give every unassigned new ticket to the agent with the fewest open tickets.",
    trigger: "ticket_created",
    conditions: [{ field: "assignee", operator: "equals", value: "unassigned" }],
    actions: [{ type: "assign_agent", value: "least_loaded" }],
  },
  {
    name: "VIP customers jump the queue",
    summary: "Raise priority to urgent and leave a note for VIP customers.",
    trigger: "ticket_created",
    conditions: [{ field: "customer_vip", operator: "equals", value: "true" }],
    actions: [
      { type: "set_priority", value: "urgent" },
      { type: "add_internal_note", value: "VIP customer. Respond first." },
    ],
  },
  {
    name: "Escalate angry customers",
    summary: "Negative sentiment gets high priority and an escalation tag.",
    trigger: "customer_replied",
    conditions: [{ field: "sentiment", operator: "equals", value: "negative" }],
    actions: [
      { type: "set_priority", value: "high" },
      { type: "add_tag", value: "escalated" },
    ],
  },
  {
    name: "Nudge stale tickets",
    summary: "Open tickets with no activity for 24 hours become high priority and get tagged.",
    trigger: "ticket_inactive",
    conditions: [{ field: "status", operator: "equals", value: "open" }],
    actions: [
      { type: "set_priority", value: "high" },
      { type: "add_tag", value: "needs-follow-up" },
    ],
    triggerConfig: { inactiveMinutes: 1440 },
  },
  {
    name: "After-hours acknowledgement",
    summary: "Outside business hours, tag the ticket so the morning shift sees it first.",
    trigger: "ticket_created",
    conditions: [{ field: "business_hours", operator: "equals", value: "false" }],
    actions: [{ type: "add_tag", value: "after-hours" }],
  },
];

export function AutomationRecipes() {
  const createRule = useCreateAutomationRule();

  const add = (r: Recipe) =>
    createRule.mutate(
      {
        name: r.name,
        trigger: r.trigger,
        isActive: false,
        position: 0,
        conditions: r.conditions,
        actions: r.actions,
        triggerConfig: r.triggerConfig ?? {},
      },
      {
        onSuccess: () => toast.success(`"${r.name}" added. Test it, then switch it on.`),
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't add the recipe."),
      }
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Wand2 className="h-4 w-4" /> Start from a recipe
        </CardTitle>
        <p className="text-xs text-muted-foreground">Added switched off, so you can test each one on a real ticket before it runs.</p>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {RECIPES.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.summary}</p>
            </div>
            <Button size="sm" variant="outline" disabled={createRule.isPending} onClick={() => add(r)}>
              Add
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
