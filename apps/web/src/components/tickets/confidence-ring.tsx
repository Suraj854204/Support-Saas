"use client";

import { cn } from "@/lib/utils";

type RingTone = "sla" | "ai" | "sentiment-positive" | "sentiment-neutral" | "sentiment-negative";

interface ConfidenceRingProps {
  /** 0–100. For SLA this is "% of allotted time remaining" (100 = fresh, 0 = breached). */
  value: number;
  tone: RingTone;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
  className?: string;
}

const TONE_COLOR: Record<RingTone, string> = {
  sla: "var(--ring-sla-color)",
  ai: "hsl(var(--ai-accent))",
  "sentiment-positive": "hsl(var(--success))",
  "sentiment-neutral": "hsl(var(--muted-foreground))",
  "sentiment-negative": "hsl(var(--danger))",
};

/** SLA rings shift color as time runs out: green → amber → red. */
function slaColor(value: number): string {
  if (value > 50) return "hsl(var(--success))";
  if (value > 20) return "hsl(var(--warning))";
  return "hsl(var(--danger))";
}

export function ConfidenceRing({
  value,
  tone,
  size = 36,
  strokeWidth = 2.5,
  children,
  className,
}: ConfidenceRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const color = tone === "sla" ? slaColor(value) : TONE_COLOR[tone];

  return (
    <div className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          className="animate-ring-draw"
          style={{ "--offset": offset } as React.CSSProperties}
        />
      </svg>
      <div className="flex items-center justify-center" style={{ width: size - strokeWidth * 3, height: size - strokeWidth * 3 }}>
        {children}
      </div>
    </div>
  );
}
