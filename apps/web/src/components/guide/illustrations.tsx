"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Bot, Check, FileText, Filter, Send, Sparkles, UserRound, Webhook, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";

/**
 * Small looping illustrations used by the welcome tour and the guide.
 * They only use theme tokens, so they work in light and dark, and they
 * stay still when the visitor prefers reduced motion.
 */

function Stage({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <div role="img" aria-label={label} className={cn("relative flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 p-4", className)}>
      {children}
    </div>
  );
}

const LOOP = { repeat: Infinity, repeatDelay: 1.2 } as const;

/* 1. Inbox: tickets arrive, one gets solved */
export function InboxIllustration() {
  const reduce = useReducedMotion();
  const rows = [
    { t: "Refund not received", tone: "bg-danger" },
    { t: "Can't reset password", tone: "bg-warning" },
    { t: "Invoice question", tone: "bg-primary" },
  ];
  return (
    <Stage label="Tickets arrive in one inbox and get solved one by one">
      <div className="w-full max-w-sm space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.t}
            initial={reduce ? false : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduce ? 0 : i * 0.35, duration: 0.45, ease: "easeOut", ...(reduce ? {} : { repeat: Infinity, repeatDelay: 4.2, repeatType: "loop" as const }) }}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-card"
          >
            <span className={cn("h-2 w-2 rounded-full", r.tone)} />
            <span className="flex-1 truncate text-sm">{r.t}</span>
            <motion.span
              animate={reduce ? undefined : { backgroundColor: ["hsl(var(--primary) / 0.12)", "hsl(var(--primary) / 0.12)", "hsl(var(--success) / 0.15)"], color: ["hsl(var(--primary))", "hsl(var(--primary))", "hsl(var(--success))"] }}
              transition={reduce || i !== 0 ? undefined : { duration: 3, times: [0, 0.6, 1], ...LOOP }}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              {i === 0 ? "Open → Solved" : "Open"}
            </motion.span>
          </motion.div>
        ))}
      </div>
    </Stage>
  );
}

/* 2. AI reply: confidence fills, sources pop, reply gets used */
export function AiReplyIllustration() {
  const reduce = useReducedMotion();
  return (
    <Stage label="The AI drafts a reply, shows its confidence and the article it used">
      <div className="w-full max-w-sm space-y-2.5">
        <div className="ml-auto w-4/5 rounded-xl rounded-tr-sm bg-surface px-3 py-2 text-xs shadow-card">Where is my refund?</div>
        <div className="rounded-xl border border-ai/30 bg-ai/[0.08] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-ai">
            <Sparkles className="h-3 w-3" /> AI suggested reply
            <span className="ml-auto tabular">92%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-ai" initial={{ width: reduce ? "92%" : "0%" }} animate={{ width: "92%" }} transition={{ duration: 1.4, ease: "easeOut", ...(reduce ? {} : LOOP) }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Refunds arrive in 5 to 10 business days…</p>
          <div className="mt-2.5 flex items-center justify-between">
            <motion.span
              initial={reduce ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: reduce ? 0 : 1.2, duration: 0.3, ...(reduce ? {} : { repeat: Infinity, repeatDelay: 2.4 }) }}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px]"
            >
              <FileText className="h-3 w-3" /> Refund policy
            </motion.span>
            <motion.span
              animate={reduce ? undefined : { scale: [1, 1, 1.08, 1] }}
              transition={reduce ? undefined : { duration: 2.6, times: [0, 0.6, 0.8, 1], ...LOOP }}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
            >
              <Send className="h-3 w-3" /> Use this reply
            </motion.span>
          </div>
        </div>
      </div>
    </Stage>
  );
}

/* 3. Knowledge: article -> AI -> grounded answer */
export function KnowledgeIllustration() {
  const reduce = useReducedMotion();
  const nodes = [
    { icon: FileText, label: "Your article" },
    { icon: Bot, label: "AI reads it" },
    { icon: Check, label: "Grounded answer" },
  ];
  return (
    <Stage label="Your published articles are what the AI reads when it writes an answer">
      <div className="relative flex w-full max-w-sm items-center justify-between">
        <div className="absolute left-6 right-6 top-5 h-px bg-border" />
        {!reduce && (
          <motion.span className="absolute left-6 top-[18px] h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" animate={{ x: [0, 118, 236], opacity: [1, 1, 0] }} transition={{ duration: 2.6, ease: "easeInOut", ...LOOP }} />
        )}
        {nodes.map((n, i) => (
          <motion.div
            key={n.label}
            animate={reduce ? undefined : { y: [0, -3, 0] }}
            transition={reduce ? undefined : { duration: 0.6, delay: i * 1.1, ...LOOP, repeatDelay: 3 }}
            className="relative z-10 flex w-24 flex-col items-center gap-2 text-center"
          >
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border bg-surface shadow-card", i === 2 ? "border-success/40 text-success" : "border-border text-primary")}>
              <n.icon className="h-4 w-4" />
            </span>
            <span className="text-[11px] text-muted-foreground">{n.label}</span>
          </motion.div>
        ))}
      </div>
    </Stage>
  );
}

/* 4. Automation: trigger -> condition -> action, a pulse travels along */
export function AutomationIllustration() {
  const reduce = useReducedMotion();
  const steps = [
    { icon: Zap, title: "When", text: "Ticket created", tone: "text-primary" },
    { icon: Filter, title: "If", text: "Customer is VIP", tone: "text-warning" },
    { icon: UserRound, title: "Then", text: "Assign + urgent", tone: "text-success" },
  ];
  return (
    <Stage label="An automation rule: when something happens, check a condition, then act">
      <div className="flex w-full max-w-md items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.title} className="flex flex-1 items-center gap-2">
            <motion.div
              animate={reduce ? undefined : { boxShadow: ["0 0 0 0 hsl(var(--primary) / 0)", "0 0 0 4px hsl(var(--primary) / 0.25)", "0 0 0 0 hsl(var(--primary) / 0)"] }}
              transition={reduce ? undefined : { duration: 0.9, delay: i * 0.9, ...LOOP, repeatDelay: 2.4 }}
              className="flex-1 rounded-lg border border-border bg-surface p-2.5 text-center shadow-card"
            >
              <s.icon className={cn("mx-auto h-4 w-4", s.tone)} />
              <p className="mt-1 text-[11px] font-medium">{s.title}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">{s.text}</p>
            </motion.div>
            {i < steps.length - 1 && <span className="h-px w-3 shrink-0 bg-border" />}
          </div>
        ))}
      </div>
    </Stage>
  );
}

/* 5. Team workload: least-loaded agent gets the ticket */
export function TeamIllustration() {
  const reduce = useReducedMotion();
  const agents = [
    { n: "Ava", v: 78 },
    { n: "Leo", v: 54 },
    { n: "Mira", v: 22 },
  ];
  return (
    <Stage label="Open tickets per agent; new tickets can go to whoever has the fewest">
      <div className="w-full max-w-sm space-y-3">
        {agents.map((a, i) => (
          <div key={a.n} className="flex items-center gap-3 text-xs">
            <span className="w-10 text-muted-foreground">{a.n}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div className={cn("h-full rounded-full", i === 2 ? "bg-success" : "bg-primary/70")} initial={{ width: reduce ? `${a.v}%` : 0 }} animate={{ width: `${a.v}%` }} transition={{ duration: 1, delay: reduce ? 0 : i * 0.15, ease: "easeOut" }} />
            </div>
            <span className="tabular w-6 text-right">{Math.round(a.v / 6)}</span>
          </div>
        ))}
        <p className="pt-1 text-center text-[11px] text-success">Next ticket → Mira (fewest open)</p>
      </div>
    </Stage>
  );
}

/* 6. Insights: sample chart */
const SAMPLE = [6, 9, 7, 12, 10, 14, 11, 15, 13, 17].map((created, i) => ({ d: i + 1, created, resolved: Math.max(3, created - 3 + (i % 3)) }));
export function InsightsIllustration() {
  const reduce = useReducedMotion();
  return (
    <Stage label="A sample chart of tickets created and resolved over time" className="h-52 px-2">
      <div className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={SAMPLE} margin={{ top: 14, right: 12, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
            <Area type="monotone" dataKey="created" name="Created" stroke="hsl(var(--primary))" fill="url(#gC)" strokeWidth={2} isAnimationActive={!reduce} />
            <Area type="monotone" dataKey="resolved" name="Resolved" stroke="hsl(var(--success))" fill="none" strokeWidth={2} isAnimationActive={!reduce} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <span className="absolute right-3 top-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Sample data</span>
    </Stage>
  );
}

/* 7. Developers: an event leaves for your server */
export function DeveloperIllustration() {
  const reduce = useReducedMotion();
  return (
    <Stage label="When a ticket changes, Loop sends a signed event to your server">
      <div className="flex w-full max-w-md items-center gap-3">
        <div className="flex-1 rounded-lg border border-border bg-surface p-2.5 font-mono text-[10.5px] leading-relaxed shadow-card">
          <p className="text-muted-foreground">POST /your-endpoint</p>
          <p>
            <span className="text-primary">&quot;type&quot;</span>: &quot;ticket.created&quot;
          </p>
          <p>
            <span className="text-primary">&quot;ticket&quot;</span>: {"{ … }"}
          </p>
        </div>
        <div className="relative h-px w-14 bg-border">
          {!reduce && <motion.span className="absolute -top-1 h-2.5 w-2.5 rounded-full bg-primary" animate={{ left: ["0%", "85%"], opacity: [1, 1, 0] }} transition={{ duration: 1.6, ease: "easeIn", ...LOOP, repeatDelay: 1.4 }} />}
        </div>
        <div className="flex w-24 flex-col items-center gap-1.5 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-success/40 bg-success/10 text-success">
            <Webhook className="h-4 w-4" />
          </span>
          <span className="text-[11px] text-muted-foreground">Your server replies 200</span>
        </div>
      </div>
    </Stage>
  );
}

/* 8. SLA: the clock runs down and turns amber */
export function SlaIllustration() {
  const reduce = useReducedMotion();
  return (
    <Stage label="An SLA timer counts down and warns before it is breached">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">First response due</span>
          <span className="text-muted-foreground">Ticket #1041</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: reduce ? "30%" : "100%", backgroundColor: "hsl(var(--success))" }}
            animate={{ width: ["100%", "30%"], backgroundColor: ["hsl(var(--success))", "hsl(var(--warning))"] }}
            transition={reduce ? { duration: 0 } : { duration: 4, ease: "easeInOut", ...LOOP }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Rules can raise priority or notify the team when time is running out.</p>
      </div>
    </Stage>
  );
}

/* 9. Customers: a profile card with history */
export function CustomerIllustration() {
  return (
    <Stage label="One profile per customer with their full history">
      <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-3 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">AR</span>
          <div>
            <p className="text-sm font-medium">Asha Rao</p>
            <p className="text-[11px] text-muted-foreground">asha@example.com</p>
          </div>
          <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">VIP</span>
        </div>
        <div className="mt-3 space-y-1.5 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
          {["Refund not received", "Login problem", "Invoice question"].map((t, i) => (
            <motion.p key={t} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.2 }}>
              • {t}
            </motion.p>
          ))}
        </div>
      </div>
    </Stage>
  );
}

export const ILLUSTRATIONS = {
  inbox: InboxIllustration,
  ai: AiReplyIllustration,
  knowledge: KnowledgeIllustration,
  automation: AutomationIllustration,
  team: TeamIllustration,
  insights: InsightsIllustration,
  developer: DeveloperIllustration,
  sla: SlaIllustration,
  customer: CustomerIllustration,
} as const;
export type IllustrationKey = keyof typeof ILLUSTRATIONS;
