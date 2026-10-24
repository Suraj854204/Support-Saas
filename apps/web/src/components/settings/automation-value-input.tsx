"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionType, ConditionField } from "@/hooks/use-automations";

type Option = { value: string; label: string };

const PRIORITIES: Option[] = ["low", "normal", "high", "urgent"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }));
const STATUSES: Option[] = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "on_hold", label: "On hold" },
  { value: "solved", label: "Solved" },
  { value: "closed", label: "Closed" },
];
const YES_NO: Option[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

const CONDITION_OPTIONS: Partial<Record<ConditionField, Option[]>> = {
  priority: PRIORITIES,
  status: STATUSES,
  channel: ["email", "chat", "web_widget", "api", "social"].map((v) => ({ value: v, label: v.replace("_", " ") })),
  sentiment: ["positive", "neutral", "negative"].map((v) => ({ value: v, label: v })),
  business_hours: YES_NO,
  customer_vip: YES_NO,
  assignee: [
    { value: "unassigned", label: "Unassigned" },
    { value: "assigned", label: "Assigned" },
  ],
};

export const CONDITION_PLACEHOLDERS: Partial<Record<ConditionField, string>> = {
  subject: "refund",
  message_text: "cancel my subscription",
  customer_tags: "enterprise",
  customer_email_domain: "bigco.com",
  ticket_age_hours: "24",
};

function Pick({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: Option[]; placeholder: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Value editor for a condition: a dropdown where the field has fixed choices, a number box for age, text otherwise. */
export function ConditionValueInput({ field, value, onChange }: { field: ConditionField; value: string; onChange: (v: string) => void }) {
  const options = CONDITION_OPTIONS[field];
  if (options) return <Pick value={value} onChange={onChange} options={options} placeholder="Choose…" />;
  return (
    <Input
      value={value}
      type={field === "ticket_age_hours" ? "number" : "text"}
      min={field === "ticket_age_hours" ? 0 : undefined}
      placeholder={CONDITION_PLACEHOLDERS[field] ?? "value"}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Value editor for simple actions. Team/agent/email actions are rendered by the form since they need data. */
export function SimpleActionValueInput({ type, value, onChange }: { type: ActionType; value: string; onChange: (v: string) => void }) {
  if (type === "set_priority") return <Pick value={value} onChange={onChange} options={PRIORITIES} placeholder="Priority" />;
  if (type === "set_status") return <Pick value={value} onChange={onChange} options={STATUSES} placeholder="Status" />;
  if (type === "stop_processing") return <p className="flex h-9 flex-1 items-center text-xs text-muted-foreground">Rules after this one are skipped for the ticket.</p>;
  return (
    <Input
      value={value}
      placeholder={type === "add_internal_note" ? "Note visible to agents only" : "refund"}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
