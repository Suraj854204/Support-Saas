"use client";

import { CheckCircle2, Mail, MessageCircle, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-auth";
import { useEscalations, useLogContact, type EscalationRow, type EscalationState } from "@/hooks/use-escalations";
import { relativeTime, ticketRef, timeLeftLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: EscalationState; label: string }> = [
  { id: "open", label: "Needs contact" },
  { id: "overdue", label: "Overdue" },
  { id: "done", label: "Contacted" },
];

function digits(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function Row({ e, now, canAct, onLog }: { e: EscalationRow; now: number; canAct: boolean; onLog: (e: EscalationRow) => void }) {
  const left = timeLeftLabel(e.contactDueAt, now);
  const done = e.contactedAt !== null;
  const phone = e.customer.phone;
  return (
    <li className={cn("rounded-xl border bg-surface p-4 shadow-card", !done && left.overdue ? "border-danger/50" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-xs text-muted-foreground">{ticketRef(e.ticket.number)}</span>
        <Badge variant={e.level === "critical" ? "danger" : "warning"}>{e.level === "critical" ? "Critical" : "High"}</Badge>
        {e.preferredMethod && <Badge variant="outline">Prefers {e.preferredMethod === "call" ? "a call" : "a message"}</Badge>}
        <span className={cn("tabular ml-auto text-xs font-medium", done ? "text-success" : left.overdue ? "text-danger" : "text-warning")}>
          {done ? `Contacted ${relativeTime(e.contactedAt as string)} by ${e.contactMethod}` : left.text}
        </span>
      </div>

      <Link href={`/tickets/${e.ticket.id}`} className="mt-2 block text-sm font-medium hover:underline">{e.ticket.subject}</Link>
      {e.ticket.preview && <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{e.ticket.preview}</p>}

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {e.reasons.map((r) => <li key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r}</li>)}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="mr-auto text-xs text-muted-foreground">
          {e.customer.name ? `${e.customer.name} · ` : ""}{e.customer.email.endsWith("@google-form.invalid") ? "No email given" : e.customer.email}{phone ? ` · ${phone}` : " · No phone given"}
        </span>
        {!done && (
          <>
            {phone && (
              <Button asChild size="sm" variant="outline"><a href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Phone className="mr-1.5 h-3.5 w-3.5" />Call</a></Button>
            )}
            {phone && (
              <Button asChild size="sm" variant="outline"><a href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" />WhatsApp</a></Button>
            )}
            {!e.customer.email.endsWith("@google-form.invalid") && (
              <Button asChild size="sm" variant="outline"><Link href={`/tickets/${e.ticket.id}`}><Mail className="mr-1.5 h-3.5 w-3.5" />Reply</Link></Button>
            )}
            {canAct && <Button size="sm" onClick={() => onLog(e)}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Mark as contacted</Button>}
          </>
        )}
      </div>
    </li>
  );
}

export default function EscalationsPage() {
  const { data: user } = useCurrentUser();
  const canAct = user?.role !== "viewer";
  const [state, setState] = useState<EscalationState>("open");
  const { data, isLoading } = useEscalations(state);
  const log = useLogContact();
  const [now, setNow] = useState(() => Date.now());
  const [target, setTarget] = useState<EscalationRow | null>(null);
  const [method, setMethod] = useState<"call" | "message">("call");
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const submit = () => {
    if (!target) return;
    log.mutate(
      { id: target.id, method, note: note.trim() || undefined },
      {
        onSuccess: () => { toast.success("Logged. Nice work."); setTarget(null); setNote(""); },
        onError: () => toast.error("Couldn't save. Try again."),
      }
    );
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Escalations"
        description="Serious matters: suspected defects, safety, legal or fraud wording, and large amounts. Each one must be contacted by call or message within 24 hours."
      />

      <div className="mb-4 inline-flex rounded-md bg-muted p-1 text-sm" role="tablist" aria-label="Escalation filter">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={state === t.id} onClick={() => setState(t.id)} className={cn("rounded-sm px-3 py-1 transition-colors", state === t.id ? "bg-surface font-medium shadow-card" : "text-muted-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="space-y-3"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{state === "done" ? "Nothing contacted yet" : "Nothing waiting. All clear."}</p>
          <p className="max-w-sm text-sm text-muted-foreground">When a message looks serious, it shows up here with a 24-hour countdown.</p>
        </div>
      ) : (
        <ul className="space-y-3">{data.map((e) => <Row key={e.id} e={e} now={now} canAct={canAct} onLog={(r) => { setTarget(r); setMethod(r.preferredMethod ?? (r.customer.phone ? "call" : "message")); }} />)}</ul>
      )}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as contacted</DialogTitle>
            <DialogDescription>{target ? `${ticketRef(target.ticket.number)}: ${target.ticket.subject}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="inline-flex rounded-md bg-muted p-1 text-sm" role="tablist" aria-label="How you contacted them">
              {(["call", "message"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={method === k} onClick={() => setMethod(k)} className={cn("rounded-sm px-3 py-1", method === k ? "bg-surface font-medium shadow-card" : "text-muted-foreground")}>
                  {k === "call" ? "I called" : "I sent a message"}
                </button>
              ))}
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was agreed? (optional)" className="min-h-20" aria-label="Note" />
            <Button onClick={submit} disabled={log.isPending}>{log.isPending ? "Saving..." : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
