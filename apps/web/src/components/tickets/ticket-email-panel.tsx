"use client";

import { Copy, Download, Mail } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useDownloadAttachment, useRegenerateTrackingLink, useTicketNotifications } from "@/hooks/use-tickets";
import type { TicketDetail } from "@/hooks/use-tickets";
import { ApiRequestError } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

const NOTIFICATION_STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "muted"> = {
  sent: "success",
  pending: "warning",
  processing: "warning",
  failed: "danger",
};

export function TicketEmailPanel({ ticket }: { ticket: TicketDetail }) {
  const regenerate = useRegenerateTrackingLink();
  const downloadAttachment = useDownloadAttachment();
  const { data: notifications } = useTicketNotifications(ticket.id);

  if (ticket.channel !== "email" && ticket.inboundEmailMessages.length === 0) return null;

  const onCopyTrackingLink = () => {
    regenerate.mutate(ticket.id, {
      onSuccess: (data) => {
        navigator.clipboard.writeText(data.trackingUrl);
        toast.success("Tracking link copied — it's a one-time-use fresh link");
      },
      onError: (err) => {
        toast.error(err instanceof ApiRequestError ? err.message : "Couldn't create a tracking link.");
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Mail className="h-3.5 w-3.5" /> Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ticket.gmailThreadId && (
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Gmail thread</span>
            <p className="truncate font-mono text-xs">{ticket.gmailThreadId}</p>
          </div>
        )}

        {ticket.inboundEmailMessages.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">
              {ticket.inboundEmailMessages.length} inbound message
              {ticket.inboundEmailMessages.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {ticket.attachments.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Attachments</span>
            <div className="space-y-1">
              {ticket.attachments.map((a) => (
                <button
                  key={a.id}
                  className="flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs hover:bg-muted/40"
                  disabled={downloadAttachment.isPending}
                  onClick={() =>
                    downloadAttachment.mutate(
                      { id: a.id, filename: a.filename },
                      { onError: () => toast.error("Couldn't download attachment.") }
                    )
                  }
                >
                  <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.filename}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {(a.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {ticket.inboundEmailMessages.some((m) => m.attachments.some((a) => a.blocked)) && (
          <p className="text-xs text-muted-foreground">
            Some attachments on this ticket were blocked by size/type policy and aren&apos;t available for
            download.
          </p>
        )}

        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onCopyTrackingLink}>
          <Copy className="h-3.5 w-3.5" />
          Copy customer tracking link
        </Button>

        {notifications && notifications.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Notification history</span>
              {notifications.map((n) => (
                <div key={n.id} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{n.eventType.replace(/\./g, " ")}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={NOTIFICATION_STATUS_VARIANT[n.status] ?? "muted"} className="text-[10px]">
                      {n.status}
                    </Badge>
                    <span className="text-muted-foreground">{relativeTime(n.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
