"use client";

import { RotateCw, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SecretRevealDialog } from "@/components/developers/secret-reveal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  WEBHOOK_EVENTS,
  useCreateWebhook,
  useDeleteWebhook,
  useRetryDelivery,
  useRotateWebhookSecret,
  useSendTestWebhook,
  useUpdateWebhook,
  useWebhookDeliveries,
  useWebhooks,
  type WebhookRow,
} from "@/hooks/use-developers";
import { ApiRequestError } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

const statusVariant = { delivered: "success", pending: "warning", dead: "danger" } as const;

function Deliveries({ endpointId }: { endpointId: string }) {
  const { data, isLoading } = useWebhookDeliveries(endpointId);
  const retry = useRetryDelivery(endpointId);

  if (isLoading) return <Skeleton className="h-12 w-full" />;
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground">No deliveries yet. Send a test event.</p>;

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {data.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant[d.status]}>{d.status}</Badge>
              <span className="font-mono">{d.eventType}</span>
            </div>
            <p className="truncate text-muted-foreground">
              {relativeTime(d.createdAt)} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
              {d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ""}
              {d.lastError ? ` · ${d.lastError}` : ""}
            </p>
          </div>
          {d.status === "dead" && (
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onClick={() => retry.mutate(d.id, { onError: () => toast.error("Couldn't retry this delivery.") })}
            >
              Retry
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function WebhookItem({ hook, onSecret }: { hook: WebhookRow; onSecret: (s: string) => void }) {
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  const rotate = useRotateWebhookSecret();
  const test = useSendTestWebhook();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate font-mono text-sm">{hook.url}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="muted">{hook.format === "slack" ? "Slack" : "JSON"}</Badge>
              <span>{hook.events.length === 0 ? "All events" : hook.events.join(", ")}</span>
              {hook.description && <span>· {hook.description}</span>}
            </div>
            {hook.disabledReason && <p className="text-xs text-danger">{hook.disabledReason}</p>}
          </div>
          <Switch
            checked={hook.isActive}
            aria-label="Active"
            onCheckedChange={(isActive) =>
              update.mutate({ id: hook.id, isActive }, { onError: () => toast.error("Couldn't update the webhook.") })
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={test.isPending}
            onClick={() =>
              test.mutate(hook.id, {
                onSuccess: () => {
                  toast.success("Test event queued");
                  setOpen(true);
                },
                onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't send the test."),
              })
            }
          >
            <Send className="h-3.5 w-3.5" /> Send test
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide deliveries" : "Deliveries"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={rotate.isPending}
            onClick={() => {
              if (window.confirm("Rotate the signing secret? Your receiver must be updated with the new one.")) {
                rotate.mutate(hook.id, {
                  onSuccess: (r) => onSecret(r.secret),
                  onError: () => toast.error("Couldn't rotate the secret."),
                });
              }
            }}
          >
            <RotateCw className="h-3.5 w-3.5" /> Rotate secret
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Delete this webhook and its delivery history?")) {
                remove.mutate(hook.id, { onError: () => toast.error("Couldn't delete the webhook.") });
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
        {open && <Deliveries endpointId={hook.id} />}
      </CardContent>
    </Card>
  );
}

export function WebhooksCard() {
  const { data: hooks, isLoading } = useWebhooks();
  const create = useCreateWebhook();

  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<"json" | "slack">("json");
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);

  const onCreate = () => {
    if (!url.trim()) {
      toast.error("Enter the endpoint URL.");
      return;
    }
    create.mutate(
      { url: url.trim(), format, events },
      {
        onSuccess: (res) => {
          setSecret(res.secret);
          setUrl("");
          setEvents([]);
        },
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't create the webhook."),
      }
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Add webhook endpoint</CardTitle>
          <p className="text-xs text-muted-foreground">
            Payloads are signed (<code className="font-mono">X-Support-Signature</code>, HMAC-SHA256) and retried with backoff. Choose Slack to post
            straight into a Slack incoming webhook.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">URL</Label>
              <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/support" />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as "json" | "slack")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Events (none selected = all)</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={events.includes(ev)}
                    onCheckedChange={(v) => setEvents((s) => (v === true ? [...s, ev] : s.filter((x) => x !== ev)))}
                  />
                  <span className="font-mono">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={onCreate} disabled={create.isPending}>
            {create.isPending ? "Adding..." : "Add endpoint"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !hooks || hooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p>
      ) : (
        <div className="space-y-3">
          {hooks.map((h) => (
            <WebhookItem key={h.id} hook={h} onSecret={setSecret} />
          ))}
        </div>
      )}

      <SecretRevealDialog secret={secret} title="Webhook signing secret" onClose={() => setSecret(null)} />
    </div>
  );
}
