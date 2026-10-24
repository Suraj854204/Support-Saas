"use client";

import { useCallback, useEffect, useState } from "react";

import { OPEN_SHORTCUTS_EVENT } from "@/components/layout/sidebar-extras";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";

const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; text: string }> }> = [
  {
    title: "Go anywhere",
    items: [
      { keys: ["Ctrl / ⌘", "K"], text: "Search tickets, customers and pages" },
      { keys: ["D"], text: "Go to Dashboard" },
      { keys: ["T"], text: "Go to Inbox" },
    ],
  },
  {
    title: "Working on a ticket",
    items: [
      { keys: ["Ctrl / ⌘", "Enter"], text: "Send the reply" },
    ],
  },
  {
    title: "Help",
    items: [{ keys: ["?"], text: "Show this panel" }],
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{children}</kbd>;
}

export function ShortcutsDialog({ suspended }: { suspended?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, show);
  }, []);
  useKeyboardShortcut({ key: "?", handler: toggle, enabled: !suspended });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single-key shortcuts pause while you are typing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</h3>
              <ul className="mt-2 space-y-2">
                {g.items.map((it) => (
                  <li key={it.text} className="flex items-center justify-between gap-3 text-sm">
                    <span>{it.text}</span>
                    <span className="flex items-center gap-1">{it.keys.map((k) => <Key key={k}>{k}</Key>)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
