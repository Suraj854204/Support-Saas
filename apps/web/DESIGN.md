# Design system — Loop (AI Customer Support)

Product name used in the UI: **Loop** — closing the loop between customers,
agents, and AI. Registered as a working brand name for this build; swap freely.

## Why these choices

This is an operator's tool (agents live in it 8 hours a day), not a marketing
site — so the design leans on the density and restraint of Linear/Stripe/
Vercel rather than a "hero" landing treatment. The one place we take a real
point of view is the **AI confidence ring**: a small arc motif reused for AI
reply confidence, sentiment, and SLA countdowns, so "AI is watching this
ticket" reads as one consistent visual language instead of a badge here and
a sparkle icon there.

## Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#FCFCFB` | `#0B0C10` | App canvas |
| `surface` | `#FFFFFF` | `#141519` | Cards, panels, sidebar |
| `border` | `#E7E7E4` | `#24262C` | Hairlines |
| `foreground` | `#14151A` | `#EDEEF2` | Primary text |
| `muted-foreground` | `#6B6D76` | `#9497A3` | Secondary text |
| `primary` | `#5046E5` | `#6C63FF` | Actions, links, focus ring |
| `ai-accent` | `#0D9488` | `#2DD4BF` | AI badges, confidence ring, "Ask AI" |
| `success` | `#16A34A` | `#4ADE80` | Solved, positive sentiment |
| `warning` | `#D97706` | `#FBBF24` | Pending, SLA at risk |
| `danger` | `#DC2626` | `#F87171` | Urgent, breached SLA, negative sentiment |

Indigo-violet as primary is a deliberate nod to the Stripe/Linear brief, not
a default — the differentiator is reserving **teal** exclusively for
AI-originated content so agents always know at a glance what the model
touched versus what a human wrote.

## Type

- **UI/body**: Inter — the right tool for dense tabular text, matches the
  named inspirations.
- **Numeric/mono**: JetBrains Mono, used only for ticket numbers, timestamps,
  and IDs (`#4521`, `2m ago`) — gives the product a technical, precise feel
  and keeps numbers tabular in tables.

Scale: `text-xs` (12px) captions/meta → `text-sm` (14px) UI default →
`text-base` (16px) body/reading → `text-lg`/`text-xl`/`text-2xl` for page
and panel titles. Headings use `font-semibold`, never bold-everywhere.

## Layout

Fixed 64px collapsed / 240px expanded left sidebar (icon+label), 56px top
bar with command palette trigger + org switcher + notifications + avatar,
content area that's either a dense table (ticket list) or a two-pane detail
view (thread left, AI/context panel right — Intercom's split is the right
call for a conversation product).

## Motion

Framer Motion used sparingly: sidebar collapse/expand, command palette
open/close, panel transitions, and the confidence ring's arc draw-in.
Nothing auto-plays or loops — every animation is a direct response to a
user action. Reduced-motion is respected via `prefers-reduced-motion`.
