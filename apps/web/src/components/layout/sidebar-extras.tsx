"use client";

import { BookOpen, Command, Keyboard, Lightbulb } from "lucide-react";
import Link from "next/link";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAnalyticsSummary } from "@/hooks/use-analytics";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/store";
import { setCommandPaletteOpen } from "@/store/slices/ui-slice";

export const OPEN_SHORTCUTS_EVENT = "loop:open-shortcuts";

const TIPS = [
  "Press ? anywhere to see every keyboard shortcut.",
  "Macros reply, set status and add tags in one click. Find them in Settings.",
  "Publish a help article and the AI can use it in its next reply.",
  "Press Ctrl or ⌘ + K to jump to any ticket, customer or page.",
  "Use Simulate on an automation rule to test it before turning it on.",
  "Add a private note to share context without the customer seeing it.",
  "Low AI confidence usually means a missing article. Write one.",
];

/** Same tip all day, a new one tomorrow. */
function tipOfTheDay(): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return TIPS[day % TIPS.length]!;
}

function openShortcuts() {
  window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
}

export function SidebarExtras({ collapsed }: { collapsed: boolean }) {
  const dispatch = useAppDispatch();
  const { data: summary } = useAnalyticsSummary();
  const openSearch = () => dispatch(setCommandPaletteOpen(true));

  if (collapsed) {
    const items = [
      { label: "Search", icon: Command, onClick: openSearch },
      { label: "Shortcuts", icon: Keyboard, onClick: openShortcuts },
    ];
    return (
      <div className="hidden flex-col items-center gap-1 px-2 pb-2 [@media(min-height:640px)]:flex">
        {items.map((it) => (
          <Tooltip key={it.label}>
            <TooltipTrigger asChild>
              <button type="button" onClick={it.onClick} aria-label={it.label} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                <it.icon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{it.label}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href="/profile?tab=guide" aria-label="Guide" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
              <BookOpen className="h-4 w-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Guide</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="hidden space-y-3 px-3 pb-3 [@media(min-height:700px)]:block">
      {summary && (
        <Link href="/tickets" className="block rounded-lg border border-border bg-background/60 p-3 transition-colors hover:border-primary/40">
          <p className="text-[11px] font-medium text-muted-foreground">Queue right now</p>
          <div className="mt-1 flex items-end justify-between">
            <span className="tabular text-2xl font-semibold leading-none">{summary.openTickets}</span>
            <span className="text-[11px] text-muted-foreground">open</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px]">
            <span className={cn("flex items-center gap-1", summary.slaAtRisk > 0 ? "text-warning" : "text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", summary.slaAtRisk > 0 ? "bg-warning" : "bg-success")} />
              {summary.slaAtRisk > 0 ? `${summary.slaAtRisk} at risk` : "All on track"}
            </span>
            <span className="tabular text-muted-foreground">{summary.resolvedToday} solved today</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" onClick={openSearch} className="flex flex-col items-center gap-1 rounded-md border border-border py-2 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
          <Command className="h-3.5 w-3.5" />
          Search
        </button>
        <button type="button" onClick={openShortcuts} className="flex flex-col items-center gap-1 rounded-md border border-border py-2 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
          <Keyboard className="h-3.5 w-3.5" />
          Shortcuts
        </button>
        <Link href="/profile?tab=guide" className="flex flex-col items-center gap-1 rounded-md border border-border py-2 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          Guide
        </Link>
      </div>

      <p className="flex gap-2 rounded-lg bg-muted/50 p-2.5 text-[11px] leading-snug text-muted-foreground">
        <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
        <span>{tipOfTheDay()}</span>
      </p>
    </div>
  );
}
