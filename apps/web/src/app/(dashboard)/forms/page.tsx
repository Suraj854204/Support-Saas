"use client";

import { FormInput, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FormManager } from "@/components/forms/form-manager";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-auth";
import { useFormSubmissions, useForms } from "@/hooks/use-forms";
import { relativeTime, ticketRef } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL = "all";
/** Hours -> label. 24h first, then whole days up to 9. */
const TIME_CHIPS: Array<{ hours?: number; label: string }> = [
  { label: "Any time" },
  { hours: 24, label: "24 hours" },
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ hours: d * 24, label: `${d} days` })),
];
const STATUS_TONE: Record<string, "default" | "warning" | "success" | "muted"> = {
  open: "default",
  pending: "warning",
  on_hold: "muted",
  solved: "success",
  closed: "muted",
};

export default function FormMessagesPage() {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const { data: forms } = useForms();
  const [formId, setFormId] = useState<string | undefined>();
  const [status, setStatus] = useState(ALL);
  const [withinHours, setWithinHours] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [manage, setManage] = useState(false);

  const { data, isLoading } = useFormSubmissions({ formId, status: status === ALL ? undefined : status, withinHours, search: search.trim() || undefined, page });
  const total = forms?.reduce((n, f) => n + f.submissions, 0) ?? 0;
  const noForms = forms && forms.length === 0;
  const meta = data?.meta;

  const pick = (id: string | undefined) => { setFormId(id); setPage(1); };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Form messages"
        description="Everything customers send through forms on your websites, in one place. Filter by form, status or words."
        actions={isAdmin ? <Button variant="outline" size="sm" onClick={() => setManage(true)}><Settings2 className="mr-1.5 h-4 w-4" />Manage forms</Button> : undefined}
      />

      {noForms ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><FormInput className="h-6 w-6" /></span>
          <p className="font-medium">No forms yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Create a form, paste the code on your website, and every message lands here and in your Inbox.</p>
          {isAdmin ? <Button onClick={() => setManage(true)}>Create your first form</Button> : <p className="text-sm text-muted-foreground">Ask an admin to create one.</p>}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by form">
            <button type="button" role="tab" aria-selected={!formId} onClick={() => pick(undefined)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors", !formId ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              All forms <span className="tabular ml-1">{total}</span>
            </button>
            {(forms ?? []).map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={formId === f.id} onClick={() => pick(f.id)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors", formId === f.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground", !f.isActive && "opacity-60")}>
                {f.name} <span className="tabular ml-1">{f.submissions}</span>
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, email or message" className="pl-9" aria-label="Search form messages" />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {["open", "pending", "on_hold", "solved", "closed"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/^./, (c) => c.toUpperCase())}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Received within">
            <span className="mr-1 text-xs text-muted-foreground">Received in last</span>
            {TIME_CHIPS.map((c) => (
              <button key={c.label} type="button" role="tab" aria-selected={withinHours === c.hours} onClick={() => { setWithinHours(c.hours); setPage(1); }} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", withinHours === c.hours ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                {c.label}
              </button>
            ))}
          </div>

          {isLoading || !data ? (
            <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
          ) : data.data.length === 0 ? (
            <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">No messages match. Try a longer time range or clear the filters.</p>
          ) : (
            <ul className="space-y-3">
              {data.data.map((s) => (
                <li key={s.id}>
                  <Link href={`/tickets/${s.id}`} className="block rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-xs text-muted-foreground">{ticketRef(s.number)}</span>
                      {s.formName && <Badge variant="outline">{s.formName}</Badge>}
                      <Badge variant={STATUS_TONE[s.status] ?? "muted"}>{s.status.replace("_", " ")}</Badge>
                      {s.escalation && !s.escalation.contacted && (
                        <Badge variant={s.escalation.level === "critical" ? "danger" : "warning"}>
                          {s.escalation.level === "critical" ? "Critical" : "High"}: contact within 24h
                        </Badge>
                      )}
                      {s.escalation?.contacted && <Badge variant="success">Contacted</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{relativeTime(s.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{s.subject}</p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{s.preview}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{s.customer.name ? `${s.customer.name} · ` : ""}{s.customer.email}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {meta.page} of {meta.totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      {isAdmin && <FormManager open={manage} onOpenChange={setManage} />}
    </div>
  );
}
