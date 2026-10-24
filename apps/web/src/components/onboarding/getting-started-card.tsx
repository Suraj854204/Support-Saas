"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { ArrowRight, Check, X } from "lucide-react";

import { Confetti } from "./confetti";

import { Button } from "@/components/ui/button";
import { useAutomationRules } from "@/hooks/use-automations";
import { useCurrentUser } from "@/hooks/use-auth";
import { useClearDemoData, useDemoDataStatus, useLoadDemoData } from "@/hooks/use-demo-data";
import { useEmailConnections } from "@/hooks/use-email-integrations";
import { useArticles } from "@/hooks/use-knowledge";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTickets } from "@/hooks/use-tickets";
import { useOrgUsers } from "@/hooks/use-users";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Item { id: string; title: string; hint: string; href: string; done: boolean }

function Ring({ done, total }: { done: number; total: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" role="img" aria-label={`${done} of ${total} steps done`}>
      <circle cx="26" cy="26" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
      <motion.circle cx="26" cy="26" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - done / total) }} transition={{ duration: 0.8, ease: "easeOut" }} transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" className="tabular fill-foreground text-[12px] font-medium">{done}/{total}</text>
    </svg>
  );
}

export function GettingStartedCard({ onReplayTour }: { onReplayTour: () => void }) {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const { state, ready, update } = useOnboarding(user?.id);

  const tickets = useTickets({ page: 1, pageSize: 1 });
  const articles = useArticles();
  const users = useOrgUsers();
  const email = useEmailConnections();
  const rules = useAutomationRules();
  const demo = useDemoDataStatus(isAdmin);
  const loadDemo = useLoadDemoData();
  const clearDemo = useClearDemoData();
  const demoTickets = demo.data?.tickets ?? 0;


  const items: Item[] = [
    { id: "ticket", title: "Get your first ticket", hint: "Connect email or send a test message.", href: "/tickets", done: (tickets.data?.meta?.totalItems ?? 0) - demoTickets > 0 },
    { id: "article", title: "Publish a help article", hint: "This is what the AI learns from.", href: "/knowledge", done: (articles.data ?? []).some((a) => a.status === "published") },
    { id: "team", title: "Invite a teammate", hint: "Share the work.", href: "/settings", done: (users.data?.length ?? 0) > 1 },
    ...(isAdmin
      ? [
          { id: "email", title: "Connect your email", hint: "Emails become tickets automatically.", href: "/settings/integrations", done: (email.data?.length ?? 0) > 0 },
          { id: "rule", title: "Create an automation", hint: "Start with one simple rule.", href: "/settings/automations", done: (rules.data?.length ?? 0) > 0 },
        ]
      : []),
    { id: "guide", title: "Read the guide", hint: "Short, animated, step by step.", href: "/profile?tab=guide", done: state.guideRead },
  ];
  const done = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done);
  const complete = done === items.length;
  const showConfetti = complete && !state.celebrated;

  useEffect(() => {
    if (!showConfetti) return;
    const t = setTimeout(() => update({ celebrated: true }), 2500);
    return () => clearTimeout(t);
  }, [showConfetti, update]);

  if (!user || !ready || state.checklistDismissed) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} aria-label="Getting started" className="relative rounded-xl border border-border bg-surface p-5 shadow-card">
      {showConfetti && <Confetti />}
      <div className="flex items-start gap-4">
        <Ring done={done} total={items.length} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{complete ? "You are all set" : "Getting started"}</h2>
          <p className="text-sm text-muted-foreground">
            {complete ? "Everything is set up. You can hide this card." : next ? `Next: ${next.title.toLowerCase()}.` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onReplayTour}>Replay tour</Button>
        <button type="button" aria-label="Hide getting started" onClick={() => update({ checklistDismissed: true })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className={cn("group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40", it.done && "bg-muted/40")}>
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", it.done ? "border-success bg-success text-white" : "border-border")}>
                  {it.done && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-medium", it.done && "text-muted-foreground line-through")}>{it.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{it.hint}</span>
                </span>
                {!it.done && <ArrowRight className="h-3.5 w-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" />}
              </Link>
            </li>
          ))}
        </AnimatePresence>
      </ul>
      {isAdmin && demo.data && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
          {demo.data.active ? (
            <>
              <span className="text-muted-foreground">Sample tickets are loaded so you can explore. They are marked &quot;demo&quot; and never contact anyone.</span>
              <Button variant="outline" size="sm" disabled={clearDemo.isPending} onClick={() => clearDemo.mutate(undefined, { onSuccess: () => toast.success("Sample data removed"), onError: () => toast.error("Couldn't remove sample data.") })}>
                Remove sample data
              </Button>
            </>
          ) : (tickets.data?.meta?.totalItems ?? 0) === 0 ? (
            <>
              <span className="text-muted-foreground">Want to look around first? Add a few sample tickets. You can remove them in one click.</span>
              <Button variant="outline" size="sm" disabled={loadDemo.isPending} onClick={() => loadDemo.mutate(undefined, { onSuccess: () => toast.success("Sample tickets added"), onError: () => toast.error("Couldn't add sample data.") })}>
                {loadDemo.isPending ? "Adding..." : "Add sample tickets"}
              </Button>
            </>
          ) : null}
        </div>
      )}
    </motion.section>
  );
}
