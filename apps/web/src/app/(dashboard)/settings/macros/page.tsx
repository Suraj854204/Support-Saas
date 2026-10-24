"use client";

import { Tag, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-auth";
import { useCreateMacro, useDeleteMacro, useMacros, type MacroPriority, type MacroStatus } from "@/hooks/use-macros";
import { ApiRequestError } from "@/lib/api-client";

const NONE = "none";
const STATUSES: MacroStatus[] = ["open", "pending", "on_hold", "solved", "closed"];
const PRIORITIES: MacroPriority[] = ["low", "normal", "high", "urgent"];
const label = (s: string) => s.replace("_", " ").replace(/^./, (c) => c.toUpperCase());

export default function MacrosPage() {
  const { data: user } = useCurrentUser();
  const canEdit = user?.role === "owner" || user?.role === "admin";
  const { data: macros, isLoading } = useMacros();
  const create = useCreateMacro();
  const remove = useDeleteMacro();

  const [name, setName] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState(NONE);
  const [priority, setPriority] = useState(NONE);
  const [tags, setTags] = useState("");

  const onCreate = () => {
    const addTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (!name.trim()) return toast.error("Give the macro a name.");
    if (!reply.trim() && status === NONE && priority === NONE && addTags.length === 0) {
      return toast.error("Choose at least one thing for the macro to do.");
    }
    create.mutate(
      {
        name: name.trim(),
        replyBody: reply.trim() || null,
        setStatus: status === NONE ? null : (status as MacroStatus),
        setPriority: priority === NONE ? null : (priority as MacroPriority),
        addTags,
      },
      {
        onSuccess: () => {
          setName(""); setReply(""); setStatus(NONE); setPriority(NONE); setTags("");
          toast.success("Macro created");
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't create the macro."),
      }
    );
  };

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <PageHeader title="Macros" description="One click to reply, change status or priority, and add tags together. Use it on any ticket from the reply box." />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !macros || macros.length === 0 ? (
          <Card><CardContent className="space-y-1 pt-6 text-sm">
            <p className="font-medium">No macros yet</p>
            <p className="text-muted-foreground">Try &quot;Solve and thank&quot;: reply with a thank-you, set status to Solved.</p>
          </CardContent></Card>
        ) : (
          macros.map((m) => (
            <Card key={m.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <p className="flex-1 text-sm font-medium">{m.name}</p>
                  {canEdit && (
                    <Button variant="ghost" size="icon" aria-label={`Delete ${m.name}`} onClick={() => remove.mutate(m.id, { onSuccess: () => toast.success("Deleted"), onError: () => toast.error("Couldn't delete it.") })}>
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  )}
                </div>
                {m.replyBody && <p className="line-clamp-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{m.replyBody}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {m.setStatus && <Badge variant="outline">Status: {label(m.setStatus)}</Badge>}
                  {m.setPriority && <Badge variant="outline">Priority: {label(m.setPriority)}</Badge>}
                  {m.addTags.map((t) => <Badge key={t} variant="muted"><Tag className="mr-1 h-3 w-3" />{t}</Badge>)}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {canEdit ? (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">New macro</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Solve and thank" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reply (optional)</Label>
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} className="min-h-20" placeholder="Hi {{customer_name}}, glad we could help. {{agent_name}}" />
              <p className="text-[11px] text-muted-foreground">{"{{customer_name}}"} and {"{{agent_name}}"} are filled in automatically.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Set status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No change</SelectItem>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Set priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No change</SelectItem>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Add tags (comma separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="refund, resolved" />
            </div>
            <Button onClick={onCreate} disabled={create.isPending}>{create.isPending ? "Creating..." : "Create macro"}</Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Ask an admin to add or change macros. You can run them from any ticket.</p>
      )}
    </div>
  );
}
