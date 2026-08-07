import { Lock, Sparkles } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials, relativeTime } from "@/lib/format";
import type { TicketMessage } from "@support-saas/shared-types";

function MessageBubble({ message }: { message: TicketMessage }) {
  if (message.authorType === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{message.body}</span>
      </div>
    );
  }

  if (message.isInternalNote) {
    return (
      <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-warning">Internal note</span>
            <span className="text-xs text-muted-foreground">{relativeTime(message.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{message.body}</p>
        </div>
      </div>
    );
  }

  const isAgentSide = message.authorType === "agent" || message.authorType === "ai";
  const isAi = message.authorType === "ai";

  return (
    <div className={cn("flex gap-3", isAgentSide && "flex-row-reverse")}>
      <Avatar className="h-7 w-7 shrink-0">
        {isAi ? (
          <AvatarFallback className="bg-ai/10 text-ai">
            <Sparkles className="h-3.5 w-3.5" />
          </AvatarFallback>
        ) : (
          <AvatarFallback className="text-xs">{initials(message.authorType === "customer" ? "Customer" : "Agent")}</AvatarFallback>
        )}
      </Avatar>
      <div className={cn("flex max-w-[75%] flex-col gap-1", isAgentSide && "items-end")}>
        <div
          className={cn(
            "rounded-lg px-3.5 py-2.5 text-sm",
            isAi
              ? "bg-ai/10 text-foreground"
              : isAgentSide
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
          )}
        >
          {isAi && (
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ai">
              <Sparkles className="h-3 w-3" /> AI suggested
            </div>
          )}
          <p className="whitespace-pre-wrap">{message.body}</p>
        </div>
        <span className="px-1 text-xs text-muted-foreground">{relativeTime(message.createdAt)}</span>
      </div>
    </div>
  );
}

export function TicketThread({ messages }: { messages: TicketMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
