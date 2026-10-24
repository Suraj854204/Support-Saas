"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, FileText, KeyRound, LockKeyhole, MailCheck, ShieldCheck, Sparkles, Waypoints } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

export type AuthMode = "login" | "register" | "forgot-password" | "reset-password";

/* ------------------------------------------------------------------ */
/* Left: a looping example of the product's core promise              */
/* ------------------------------------------------------------------ */

interface Scenario {
  customer: string;
  initials: string;
  subject: string;
  message: string;
  reply: string;
  source: string;
  confidence: number;
}

const SCENARIOS: Scenario[] = [
  {
    customer: "Olivia Martin",
    initials: "OM",
    subject: "Refund not received",
    message: "My refund was approved 10 days ago but it hasn't reached my account yet.",
    reply: "Approved refunds usually arrive in 5 to 10 business days. Yours is past that, so I've escalated it to billing with your transaction ID.",
    source: "Refund policy",
    confidence: 92,
  },
  {
    customer: "Noah Williams",
    initials: "NW",
    subject: "Can't sign in",
    message: "I get an error every time I try to log in today.",
    reply: "That error appears after a password change ends your old session. I've sent a fresh reset link to your email.",
    source: "Account access",
    confidence: 88,
  },
];

type Phase = "arrive" | "draft" | "approve" | "done";
const PHASE_MS: Record<Phase, number> = { arrive: 1600, draft: 3200, approve: 1400, done: 2200 };
const NEXT: Record<Phase, Phase> = { arrive: "draft", draft: "approve", approve: "done", done: "arrive" };

function ConfidenceArc({ value, active }: { value: number; active: boolean }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className="stroke-white/10" />
      <motion.circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-ai"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: active ? c * (1 - value / 100) : c }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
    </svg>
  );
}

function TicketDemo() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("arrive");
  const [typed, setTyped] = useState(0);
  const s = SCENARIOS[index % SCENARIOS.length]!;

  // Reduced motion: show the finished state, no loop.
  const shownPhase: Phase = reduce ? "done" : phase;
  const shownTyped = reduce ? s.reply.length : typed;

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => {
      const next = NEXT[phase];
      if (next === "arrive") setIndex((i) => i + 1);
      setPhase(next);
    }, PHASE_MS[phase]);
    return () => clearTimeout(t);
  }, [phase, reduce]);

  useEffect(() => {
    if (reduce) return;
    if (phase === "arrive") setTyped(0);
    if (phase !== "draft") return;
    const id = setInterval(() => setTyped((n) => Math.min(n + 2, s.reply.length)), 26);
    return () => clearInterval(id);
  }, [phase, s.reply.length, reduce]);

  const drafting = shownPhase !== "arrive";
  const approved = shownPhase === "approve" || shownPhase === "done";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-1 shadow-float backdrop-blur" aria-label="Example conversation">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs font-medium text-white/60">Example conversation</p>
        <AnimatePresence mode="wait">
          <motion.span
            key={shownPhase === "done" ? "done" : "open"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              shownPhase === "done" ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
            )}
          >
            {shownPhase === "done" ? "Resolved" : "Open"}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="space-y-3 rounded-xl bg-black/25 p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex gap-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-medium text-white/80">
              {s.initials}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-white/50">
                {s.customer} wrote about <span className="text-white/75">{s.subject}</span>
              </p>
              <p className="mt-1 rounded-xl rounded-tl-sm bg-white/[0.06] px-3 py-2 text-sm text-white/90">{s.message}</p>
            </div>
          </motion.div>
        </AnimatePresence>

        <motion.div
          animate={{ opacity: drafting ? 1 : 0.25 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-ai/30 bg-ai/[0.07] p-3"
        >
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <ConfidenceArc value={s.confidence} active={drafting} />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-ai">
                {drafting ? s.confidence : 0}%
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ai">
                <Sparkles className="h-3 w-3" /> AI suggested reply
              </p>
              <p className="mt-1 min-h-[3.75rem] text-[13px] leading-relaxed text-white/85">
                {s.reply.slice(0, shownTyped)}
                {!reduce && phase === "draft" && <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-white/80" />}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 rounded-md bg-white/[0.07] px-2 py-1 text-[11px] text-white/65">
                  <FileText className="h-3 w-3" /> {s.source}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-300",
                    approved ? "bg-success/20 text-success" : "bg-white/10 text-white/70"
                  )}
                >
                  {approved ? (
                    <>
                      <Check className="h-3 w-3" /> Sent
                    </>
                  ) : (
                    "Use this reply"
                  )}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

const POINTS = [
  { icon: FileText, title: "Replies drafted from your own articles", text: "The AI only answers from the knowledge base you publish." },
  { icon: Waypoints, title: "See why it said that", text: "Every suggestion shows its sources and confidence, and agents can rate it." },
  { icon: ShieldCheck, title: "Rules that route and escalate", text: "Assign by workload, flag VIPs and catch SLA risks automatically." },
];

function ShowcasePanel() {
  return (
    <section className="relative hidden flex-col justify-between overflow-hidden p-10 xl:p-14 lg:flex">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-8 w-8" />
        <span className="text-base font-semibold tracking-tight">Loop</span>
      </div>

      <div className="max-w-xl space-y-8 py-10">
        <div className="space-y-4">
          <h2 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight xl:text-5xl">
            Reply faster.
            <br />
            Know why the AI said it.
          </h2>
          <p className="max-w-md text-base text-white/60">
            One inbox for email and chat, with AI replies grounded in your knowledge base and automations that keep the queue moving.
          </p>
        </div>
        <TicketDemo />
        <ul className="grid gap-4 sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="space-y-1.5">
              <Icon className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs leading-relaxed text-white/50">{text}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-white/40">The conversation above is an example, not real customer data.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right: the form card                                               */
/* ------------------------------------------------------------------ */

function ModeTabs({ mode }: { mode: AuthMode }) {
  const active = mode === "register" ? "register" : "login";
  const tabs = [
    { id: "login", href: "/login", label: "Sign in" },
    { id: "register", href: "/register", label: "Create account" },
  ];
  return (
    <div className="relative grid grid-cols-2 rounded-xl bg-white/[0.05] p-1 text-sm font-medium">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={active === t.id ? "page" : undefined}
          className={cn("relative z-10 rounded-lg py-2 text-center transition-colors", active === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {active === t.id && <motion.span layoutId="auth-tab" className="absolute inset-0 -z-10 rounded-lg bg-white/[0.1] shadow-card" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          {t.label}
        </Link>
      ))}
    </div>
  );
}

const MODE_ICON = {
  login: KeyRound,
  register: Sparkles,
  "forgot-password": MailCheck,
  "reset-password": LockKeyhole,
} as const;

export function AuthShell({
  title,
  subtitle,
  mode = "login",
  children,
}: {
  title: string;
  subtitle: string;
  mode?: AuthMode;
  children: React.ReactNode;
}) {
  const Icon = MODE_ICON[mode];
  const showTabs = mode === "login" || mode === "register";

  // The auth experience is always dark: one calm canvas whatever the app theme is.
  return (
    <main className="dark relative min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 55% at 30% 35%, black 30%, transparent 100%)",
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-10 h-[30rem] w-[30rem] rounded-full bg-primary/20 blur-[140px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-ai/15 blur-[140px]" />

      <div className="relative grid min-h-[100dvh] lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <ShowcasePanel />

        <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark className="h-8 w-8" />
            <span className="text-base font-semibold tracking-tight">Loop</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[26rem] rounded-2xl border border-border bg-surface/90 shadow-float backdrop-blur-xl"
          >
            <div className="space-y-6 p-6 sm:p-8">
              {showTabs && <ModeTabs mode={mode} />}
              <div className="space-y-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              </div>
              <div>{children}</div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3 text-[11px] text-muted-foreground sm:px-8">
              <span className="flex items-center gap-1.5">
                <MailCheck className="h-3 w-3" /> Email code check
              </span>
              <span className="flex items-center gap-1.5">
                <LockKeyhole className="h-3 w-3" /> Encrypted connection
              </span>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
