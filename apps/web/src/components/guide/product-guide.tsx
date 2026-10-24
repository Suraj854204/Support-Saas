"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Lightbulb } from "lucide-react";
import { useState } from "react";

import { GLOSSARY, GUIDE_SECTIONS, FIRST_TEN_MINUTES } from "./guide-content";
import { ILLUSTRATIONS } from "./illustrations";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProductGuide({ isAdmin, onRead }: { isAdmin: boolean; onRead?: () => void }) {
  const sections = GUIDE_SECTIONS.filter((s) => isAdmin || !s.adminOnly);
  const [activeId, setActiveId] = useState(sections[0]!.id);
  const active = sections.find((s) => s.id === activeId) ?? sections[0]!;
  const Illustration = ILLUSTRATIONS[active.illustration];
  const path = FIRST_TEN_MINUTES.filter((s) => isAdmin || !s.adminOnly);

  return (
    <div className="space-y-8">
      <section aria-labelledby="first-ten">
        <h2 id="first-ten" className="text-sm font-semibold">Your first 10 minutes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Follow these in order. Each one takes a couple of minutes.</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {path.map((s, i) => (
            <motion.li key={s.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Link href={s.href} className="group block h-full rounded-xl border border-border bg-surface p-3.5 shadow-card transition-colors hover:border-primary/40">
                <span className="tabular text-[11px] text-muted-foreground">Minute {s.minute}</span>
                <p className="mt-1 text-sm font-medium">{i + 1}. {s.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.text}</p>
                <ArrowRight className="mt-2 h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="by-section" className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <div>
          <h2 id="by-section" className="sr-only">Guide by section</h2>
          <nav aria-label="Guide sections" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setActiveId(s.id); onRead?.(); }}
                aria-current={s.id === active.id ? "true" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  s.id === active.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        <AnimatePresence mode="wait">
          <motion.article key={active.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">{active.label}</h3>
              <p className="mt-1 text-sm">{active.summary}</p>
              <p className="mt-1 text-sm text-muted-foreground">{active.why}</p>
            </div>
            <Illustration />
            <ol className="space-y-3">
              {active.steps.map((st, i) => (
                <motion.li key={st.title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="flex gap-3">
                  <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium">{st.title}</p>
                    <p className="text-sm text-muted-foreground">{st.text}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
            {active.tip && (
              <p className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span><span className="font-medium">Tip: </span>{active.tip}</span>
              </p>
            )}
            <Button asChild size="sm">
              <Link href={active.href}>{active.cta} <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
            </Button>
          </motion.article>
        </AnimatePresence>
      </section>

      <section aria-labelledby="glossary">
        <h2 id="glossary" className="text-sm font-semibold">Words you will see</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="flex gap-2 text-sm">
              <dt className="w-24 shrink-0 font-medium">{g.term}</dt>
              <dd className="text-muted-foreground">{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
