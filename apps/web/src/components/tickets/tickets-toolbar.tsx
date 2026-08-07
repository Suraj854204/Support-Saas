"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTeams } from "@/hooks/use-teams";
import type { ListTicketsParams } from "@/hooks/use-tickets";
import { useOrgUsers } from "@/hooks/use-users";

const UNASSIGNED = "unassigned";
const ALL = "all";

function startOfPreset(preset: string): string | undefined {
  const now = new Date();
  if (preset === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (preset === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (preset === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString();
  }
  return undefined;
}

interface TicketsToolbarProps {
  params: ListTicketsParams;
  onChange: (params: ListTicketsParams) => void;
}

export function TicketsToolbar({ params, onChange }: TicketsToolbarProps) {
  const { data: users } = useOrgUsers();
  const { data: teams } = useTeams();

  const assigneeValue = params.unassigned ? UNASSIGNED : (params.assigneeId ?? ALL);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tickets by subject..."
            className="pl-8"
            defaultValue={params.search}
            onChange={(e) => onChange({ ...params, search: e.target.value, page: 1 })}
          />
        </div>

        <Select
          value={params.status ?? ALL}
          onValueChange={(v) => onChange({ ...params, status: v === ALL ? undefined : (v as never), page: 1 })}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
            <SelectItem value="solved">Solved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={params.priority ?? ALL}
          onValueChange={(v) => onChange({ ...params, priority: v === ALL ? undefined : (v as never), page: 1 })}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={params.channel ?? ALL}
          onValueChange={(v) => onChange({ ...params, channel: v === ALL ? undefined : (v as never), page: 1 })}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All channels</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="chat">Chat</SelectItem>
            <SelectItem value="web_widget">Web widget</SelectItem>
            <SelectItem value="api">API</SelectItem>
            <SelectItem value="social">Social</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={params.teamId ?? ALL}
          onValueChange={(v) => onChange({ ...params, teamId: v === ALL ? undefined : v, page: 1 })}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All teams</SelectItem>
            {teams?.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={assigneeValue}
          onValueChange={(v) =>
            onChange({
              ...params,
              assigneeId: v === ALL || v === UNASSIGNED ? undefined : v,
              unassigned: v === UNASSIGNED ? true : undefined,
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {users?.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          defaultValue="all"
          onValueChange={(preset) => onChange({ ...params, createdFrom: startOfPreset(preset), page: 1 })}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Past 7 days</SelectItem>
            <SelectItem value="month">Past 30 days</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Switch
            checked={Boolean(params.unreadOnly)}
            onCheckedChange={(checked) => onChange({ ...params, unreadOnly: checked || undefined, page: 1 })}
          />
          <span className="whitespace-nowrap text-muted-foreground">Unread only</span>
        </div>
      </div>
    </div>
  );
}
