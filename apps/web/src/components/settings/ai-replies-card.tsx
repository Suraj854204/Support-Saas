"use client";

import { Bot } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentOrg, useUpdateOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";

type Mode = "off" | "copilot" | "autopilot";

const MODES: { value: Mode; title: string; body: string }[] = [
  { value: "off", title: "Off", body: "The chat widget never uses AI. Agents answer everything." },
  { value: "copilot", title: "Copilot (default)", body: "Visitors only get human replies. Agents can ask AI for a draft." },
  {
    value: "autopilot",
    title: "Autopilot",
    body: "AI answers visitors from your published articles. Refunds, payments, account security, serious problems and anything it is unsure about go to a person.",
  },
];

export function AiRepliesCard() {
  const { data: org } = useCurrentOrg();
  const update = useUpdateOrg();
  const current: Mode = org?.aiReplyMode ?? "copilot";

  const choose = (mode: Mode) => {
    if (mode === current) return;
    update.mutate(
      { aiReplyMode: mode },
      {
        onSuccess: () => toast.success(`AI replies: ${MODES.find((m) => m.value === mode)?.title}`),
        onError: () => toast.error("Couldn't change the AI reply mode. Try again."),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-ai" /> AI replies on the chat widget
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="AI reply mode" className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={current === m.value}
              disabled={update.isPending}
              onClick={() => choose(m.value)}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
                current === m.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              )}
            >
              <span className="block font-medium">{m.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{m.body}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
