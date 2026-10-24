"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";

import { AiReplyIllustration, AutomationIllustration, InboxIllustration, KnowledgeIllustration } from "@/components/guide/illustrations";
import { Button } from "@/components/ui/button";

const SLIDES = [
  { title: "Welcome to Loop", text: "Customer messages from every channel arrive in one inbox, so nothing gets lost.", Art: InboxIllustration },
  { title: "AI writes the first draft", text: "It shows how sure it is and which article it used. You decide what gets sent.", Art: AiReplyIllustration },
  { title: "Teach it with articles", text: "Publish help articles once. The AI uses them to answer in your words.", Art: KnowledgeIllustration },
  { title: "Let rules do the routine", text: "Assign, tag and escalate automatically. Test every rule before it goes live.", Art: AutomationIllustration },
];

export function WelcomeTour({ open, name, onClose }: { open: boolean; name?: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, SLIDES.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const slide = SLIDES[i]!;
  const last = i === SLIDES.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <motion.div role="dialog" aria-modal="true" aria-label="Welcome tour" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-float">
            <button type="button" onClick={onClose} aria-label="Close tour" className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            <AnimatePresence mode="wait">
              <motion.div key={i} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }} className="space-y-4">
                <slide.Art />
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{i === 0 && name ? `Welcome, ${name.split(" ")[0]}` : slide.title}</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">{slide.text}</p>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-1.5" aria-hidden>
                {SLIDES.map((_, k) => (
                  <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-primary" : "w-1.5 bg-border"}`} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {i > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setI(i - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>
                )}
                {last ? (
                  <Button size="sm" onClick={onClose}>Get started</Button>
                ) : (
                  <Button size="sm" onClick={() => setI(i + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
                )}
              </div>
            </div>
            {!last && (
              <button type="button" onClick={onClose} className="mt-3 text-xs text-muted-foreground hover:text-foreground">Skip tour</button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
