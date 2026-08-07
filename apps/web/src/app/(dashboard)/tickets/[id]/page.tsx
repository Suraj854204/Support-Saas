"use client";

import { ArrowLeft, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AiSuggestionCard } from "@/components/tickets/ai-suggestion-card";
import { MessageComposer, type MessageComposerHandle } from "@/components/tickets/message-composer";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { StatusBadge } from "@/components/tickets/status-badge";
import { TicketContextPanel } from "@/components/tickets/ticket-context-panel";
import { TicketThread } from "@/components/tickets/ticket-thread";
import { TypingIndicator } from "@/components/tickets/typing-indicator";
import { useAiSuggestion } from "@/hooks/use-ai-suggestion";
import { useTicketRoom } from "@/hooks/use-ticket-room";
import { useTicket } from "@/hooks/use-tickets";
import { ticketRef } from "@/lib/format";

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: ticket, isLoading } = useTicket(params.id);
  const { typingUsers, viewerCount, emitTyping } = useTicketRoom(params.id);
  const aiSuggestion = useAiSuggestion(params.id);
  const composerRef = useRef<MessageComposerHandle>(null);

  if (isLoading || !ticket) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] md:-m-6">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Link href="/tickets" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{ticket.subject}</h1>
            <span className="font-mono text-xs text-muted-foreground">{ticketRef(ticket.number)}</span>
          </div>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {viewerCount > 1 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {viewerCount}
            </span>
          )}
        </div>

        <Card className="m-4 flex flex-1 flex-col overflow-hidden rounded-lg">
          <TicketThread messages={ticket.messages} />
          <TypingIndicator names={typingUsers.map((u) => u.userName)} />

          {aiSuggestion.data && (
            <AiSuggestionCard
              suggestion={aiSuggestion.data}
              onUse={() => {
                composerRef.current?.insertText(aiSuggestion.data.suggested_reply);
                aiSuggestion.reset();
              }}
              onDismiss={() => aiSuggestion.reset()}
            />
          )}

          {!aiSuggestion.data && (
            <div className="flex justify-end px-3 pb-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-ai"
                disabled={aiSuggestion.isPending}
                onClick={() =>
                  aiSuggestion.mutate(undefined, {
                    onError: () => toast.error("Couldn't get an AI suggestion right now."),
                  })
                }
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiSuggestion.isPending ? "Thinking..." : "Suggest a reply"}
              </Button>
            </div>
          )}

          <MessageComposer ref={composerRef} ticketId={ticket.id} onTyping={emitTyping} />
        </Card>
      </div>

      <TicketContextPanel ticket={ticket} />
    </div>
  );
}

