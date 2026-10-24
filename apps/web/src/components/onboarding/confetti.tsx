"use client";

import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--ai))", "hsl(var(--danger))"];

/** A short burst of confetti. Renders nothing for people who prefer reduced motion. */
export function Confetti() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const pieces = Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2;
    const dist = 90 + ((i * 37) % 70);
    return { i, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 30, r: (i * 53) % 360, c: COLORS[i % COLORS.length]! };
  });
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-8 z-10">
      {pieces.map((p) => (
        <motion.span
          key={p.i}
          className="absolute h-2 w-1.5 rounded-sm"
          style={{ backgroundColor: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 90], opacity: [1, 1, 0], rotate: p.r, scale: [1, 1, 0.6] }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
