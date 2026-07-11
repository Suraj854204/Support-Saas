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
import type { ListTicketsParams } from "@/hooks/use-tickets";

interface TicketsToolbarProps {
  params: ListTicketsParams;
  onChange: (params: ListTicketsParams) => void;
}

export function TicketsToolbar({ params, onChange }: TicketsToolbarProps) {
  return (
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
        value={params.status ?? "all"}
        onValueChange={(v) => onChange({ ...params, status: v === "all" ? undefined : (v as never), page: 1 })}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="on_hold">On hold</SelectItem>
          <SelectItem value="solved">Solved</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={params.priority ?? "all"}
        onValueChange={(v) => onChange({ ...params, priority: v === "all" ? undefined : (v as never), page: 1 })}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
