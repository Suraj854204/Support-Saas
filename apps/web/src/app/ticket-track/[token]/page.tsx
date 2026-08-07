"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PriorityBadge } from "@/components/tickets/priority-badge";
import { StatusBadge } from "@/components/tickets/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitTrackingReply, useTicketTracking } from "@/hooks/use-ticket-tracking";
import { ApiRequestError } from "@/lib/api-client";

export default function TicketTrackPage() {
  const params = useParams<{ token: string }>();
  const { data, isLoading, error } = useTicketTracking(params.token);
  const submitReply = useSubmitTrackingReply(params.token);
  const [reply, setReply] = useState("");

  const onSubmitReply = () => {
    if (!reply.trim()) return;
    submitReply.mutate(reply.trim(), {
      onSuccess: () => {
        setReply("");
        toast.success("Reply sent");
      },
      onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't send your reply."),
    });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            {error instanceof ApiRequestError
              ? error.message
              : "This tracking link is invalid or has expired."}
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            {data.organizationLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.organizationLogoUrl} alt={data.organizationName} className="h-8 w-8 rounded" />
            )}
            <p className="text-sm text-muted-foreground">{data.organizationName} Support</p>
          </div>

          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-muted-foreground">{data.ticketNumber}</span>
                <div className="flex items-center gap-3">
                  <StatusBadge status={data.status} />
                  <PriorityBadge priority={data.priority} />
                </div>
              </div>
              <h1 className="text-lg font-semibold">{data.subject}</h1>
              <p className="text-xs text-muted-foreground">
                Opened {new Date(data.createdAt).toLocaleString()} · Updated{" "}
                {new Date(data.updatedAt).toLocaleString()}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.timeline.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.authorType === "agent"
                      ? "rounded-md border border-primary/20 bg-primary/5 p-3"
                      : "rounded-md border p-3"
                  }
                >
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {message.authorType === "agent" ? "Support team" : "You"} ·{" "}
                    {new Date(message.createdAt).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                </div>
              ))}

              <div className="space-y-2 border-t pt-4">
                <Textarea
                  placeholder="Add a reply..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="min-h-20"
                />
                <Button
                  size="sm"
                  onClick={onSubmitReply}
                  disabled={!reply.trim() || submitReply.isPending}
                >
                  {submitReply.isPending ? "Sending..." : "Send reply"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            You can also reply directly to the email you received from {data.organizationName} — either way
            adds to this same conversation.
          </p>
        </div>
      )}
    </div>
  );
}
