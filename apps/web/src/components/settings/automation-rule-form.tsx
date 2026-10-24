"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCannedResponses } from "@/hooks/use-canned-responses";
import { useCreateAutomationRule } from "@/hooks/use-automations";
import type {
  ActionType,
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
  ConditionField,
  ConditionOperator,
} from "@/hooks/use-automations";
import { ConditionValueInput, SimpleActionValueInput } from "@/components/settings/automation-value-input";
import { useTeams } from "@/hooks/use-teams";
import { useOrgUsers } from "@/hooks/use-users";
import { ACTION_LABELS, FIELD_LABELS, OPERATORS_BY_FIELD, OPERATOR_LABELS } from "@/lib/automation-labels";
import { ApiRequestError } from "@/lib/api-client";

const TRIGGERS: { value: AutomationTrigger; label: string }[] = [
  { value: "ticket_created", label: "Ticket created" },
  { value: "customer_replied", label: "Customer replied" },
  { value: "status_changed", label: "Status changed" },
  { value: "ticket_reopened", label: "Ticket reopened" },
  { value: "sla_approaching", label: "SLA approaching" },
  { value: "sla_breached", label: "SLA breached" },
  { value: "ticket_inactive", label: "Ticket inactive" },
];

const FIELDS = Object.keys(FIELD_LABELS) as ConditionField[];
const ACTION_TYPES = Object.keys(ACTION_LABELS) as ActionType[];

/** When the field changes, snap the operator and value to something valid for it. */
function withField(c: AutomationCondition, field: ConditionField): AutomationCondition {
  const operators = OPERATORS_BY_FIELD[field];
  return { field, operator: operators.includes(c.operator) ? c.operator : operators[0]!, value: "" };
}

export function AutomationRuleForm({ onCreated }: { onCreated?: () => void }) {
  const createRule = useCreateAutomationRule();
  const { data: teams } = useTeams();
  const { data: cannedResponses } = useCannedResponses();
  const { data: users } = useOrgUsers();

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>("ticket_created");
  const [inactiveMinutes, setInactiveMinutes] = useState(1440);
  const [conditions, setConditions] = useState<AutomationCondition[]>([
    { field: "subject", operator: "contains", value: "" },
  ]);
  const [actions, setActions] = useState<AutomationAction[]>([{ type: "add_tag", value: "" }]);

  const reset = () => {
    setName("");
    setConditions([{ field: "subject", operator: "contains", value: "" }]);
    setActions([{ type: "add_tag", value: "" }]);
  };

  const onSubmit = () => {
    if (!name.trim()) {
      toast.error("Give the rule a name.");
      return;
    }
    if (actions.some((a) => !a.value.trim())) {
      toast.error("Every action needs a value.");
      return;
    }

    createRule.mutate(
      {
        name: name.trim(),
        trigger,
        isActive: true,
        position: 0,
        conditions: conditions.filter((c) => c.value.trim()),
        actions,
        triggerConfig: trigger === "ticket_inactive" ? { inactiveMinutes } : {},
      },
      {
        onSuccess: () => {
          toast.success("Automation rule created");
          reset();
          onCreated?.();
        },
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't create rule."),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">New automation rule</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Refund requests to billing" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Trigger</Label>
          <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomationTrigger)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGERS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {trigger === "ticket_inactive" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Inactive for (minutes)</Label>
            <Input
              type="number"
              value={inactiveMinutes}
              onChange={(e) => setInactiveMinutes(Number(e.target.value))}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">Conditions (all must match)</Label>
          {conditions.map((cond, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={cond.field}
                onValueChange={(v) =>
                  setConditions((prev) => prev.map((c, idx) => (idx === i ? withField(c, v as ConditionField) : c)))
                }
              >
                <SelectTrigger className="w-44 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FIELD_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={cond.operator}
                onValueChange={(v) =>
                  setConditions((prev) =>
                    prev.map((c, idx) => (idx === i ? { ...c, operator: v as ConditionOperator } : c))
                  )
                }
              >
                <SelectTrigger className="w-48 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS_BY_FIELD[cond.field].map((op) => (
                    <SelectItem key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="min-w-0 flex-1">
                <ConditionValueInput
                  field={cond.field}
                  value={cond.value}
                  onChange={(v) => setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, value: v } : c)))}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setConditions((prev) => [...prev, { field: "subject", operator: "contains", value: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add condition
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Actions</Label>
          {actions.map((action, i) => (
            <div key={i} className="flex items-start gap-2">
              <Select
                value={action.type}
                onValueChange={(v) =>
                  setActions((prev) =>
                    prev.map((a, idx) => (idx === i ? { type: v as ActionType, value: v === "stop_processing" ? "-" : "" } : a))
                  )
                }
              >
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACTION_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {action.type === "assign_agent" ? (
                <Select
                  value={action.value}
                  onValueChange={(v) => setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, value: v } : a)))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="least_loaded">Least-loaded agent (auto)</SelectItem>
                    {users
                      ?.filter((u) => u.role === "agent" || u.role === "admin")
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : action.type === "assign_team" ? (
                <Select
                  value={action.value}
                  onValueChange={(v) => setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, value: v } : a)))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : action.type === "send_email" ? (
                <div className="flex-1 space-y-1.5">
                  <Select
                    value={action.value.startsWith("template:") ? action.value : "custom"}
                    onValueChange={(v) =>
                      setActions((prev) =>
                        prev.map((a, idx) => (idx === i ? { ...a, value: v === "custom" ? "" : v } : a))
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Use a canned response, or write custom text below" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom text</SelectItem>
                      {cannedResponses?.map((cr) => (
                        <SelectItem key={cr.id} value={`template:${cr.id}`}>
                          {cr.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!action.value.startsWith("template:") && (
                    <Textarea
                      value={action.value}
                      placeholder="Message to send the customer..."
                      className="min-h-16"
                      onChange={(e) =>
                        setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, value: e.target.value } : a)))
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <SimpleActionValueInput
                    type={action.type}
                    value={action.value}
                    onChange={(v) => setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, value: v } : a)))}
                  />
                </div>
              )}

              <Button variant="ghost" size="icon" onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setActions((prev) => [...prev, { type: "add_tag", value: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add action
          </Button>
        </div>

        <Button onClick={onSubmit} disabled={createRule.isPending}>
          {createRule.isPending ? "Creating..." : "Create rule"}
        </Button>
      </CardContent>
    </Card>
  );
}
