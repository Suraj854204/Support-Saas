# @support-saas/web — Loop

Next.js 15 + React 19 dashboard frontend. See `DESIGN.md` for the full design
rationale (color, type, layout, motion, and the "confidence ring" signature
motif shared by AI confidence, SLA countdowns, and sentiment).

## Setup

```bash
# from repo root, with the API running (see apps/api/README.md)
npm install
cd apps/web
npm run dev   # http://localhost:3000
```

`npm run build` runs a full production build (verified — see below).

## Structure

```
src/
├── app/
│   ├── (auth)/login, (auth)/register      Public auth pages, no sidebar
│   └── (dashboard)/dashboard, tickets,     Authenticated shell: sidebar +
│       teams, settings                     topbar + command palette
├── components/
│   ├── ui/          shadcn/ui primitives (button, table, command, sheet...)
│   ├── layout/       sidebar, topbar, command palette, theme toggle
│   ├── tickets/      table, badges, confidence ring, filters, pagination
│   ├── dashboard/    stat cards, volume chart, recent activity
│   ├── auth/         login/register forms (React Hook Form + Zod)
│   └── shared/       empty states, page headers
├── hooks/           TanStack Query hooks (tickets, auth), realtime, shortcuts
├── store/            Redux Toolkit — auth session + UI state (sidebar, palette)
├── providers/        Redux, TanStack Query, next-themes, silent-refresh auth
└── lib/              typed API client, Socket.IO client, formatters
```

## What's implemented

- **Dark/light mode**: `next-themes`, defaults to dark, toggle in the topbar
  and command palette, `prefers-reduced-motion` respected in `globals.css`.
- **Command palette**: `Cmd/Ctrl+K` anywhere, fuzzy search over nav + theme
  actions (cmdk-based, shadcn-styled).
- **Keyboard shortcuts**: `Cmd/Ctrl+K` (palette), `D` (dashboard), `T`
  (tickets) — disabled while typing in a field or while the palette is open.
- **Sidebar**: collapsible (Framer Motion width animation), active-route
  highlighting, tooltips when collapsed, mobile version as a slide-out sheet.
- **Tickets table**: paginated, filterable (status/priority/search), skeleton
  loading rows, empty state, SLA ring on assignee avatars.
- **Dashboard**: all four stat cards (open tickets, avg. first response,
  resolved today, SLA at risk) are backed by real Postgres queries — no
  fake numbers anywhere. SLA-at-risk uses a documented heuristic (urgent
  tickets unresolved 4h+, high-priority 24h+) since no per-org SLA policy
  config exists yet. A 14-day ticket volume area chart (Recharts) and a
  real recent-activity feed round it out.
- **Ticket detail (Phase 4)**: two-pane thread + AI/properties context panel,
  live typing indicators (bidirectional — agent↔customer, including from
  the public widget), viewer presence count, internal notes (visually
  distinct, amber-toned), inline status/priority/assignee editing, `⌘/Ctrl+Enter`
  to send.
- **AI-suggested replies (Phase 5)**: "Suggest a reply" in the ticket detail
  view calls the AI service (via the Node API) and shows a grounded reply
  with a confidence ring and the source knowledge base articles it drew
  from; "Use this reply" drops it straight into the composer.
- **New ticket dialog**: pick an existing customer or create one inline
  (name/email), set subject/priority/an optional initial message — actually
  creates the ticket via the API and navigates straight to it, no more
  placeholder alert.
- **Knowledge base**: a management page (`/knowledge`) to create, edit, and
  delete articles — publishing (or re-publishing after an edit) indexes the
  article for AI suggestions immediately, with a visible "Indexed" status
  per article.
- **Dashboard volume chart is real data** (Phase 6): backed by
  `GET /api/analytics/tickets-volume`, itself fed by a Kafka consumer
  aggregating live ticket events — not demo data.
- **Embeddable chat widget** (Phase 6): `public/widget/widget.js` is a
  dependency-free vanilla-JS widget (no React, no build step) that any
  third-party site can embed with one `<script>` tag. See
  `public/widget/demo.html` for a working example page.
- **Realtime**: Socket.IO client authenticated with the same JWT access
  token; ticket create/update/message events invalidate the relevant
  TanStack Query cache so both the list and detail view update live, and
  per-ticket rooms carry typing/presence events.
- **Auth**: register/login forms (RHF + Zod), silent access-token refresh on
  page load via the httpOnly refresh cookie, logout.
- **Fonts self-hosted** via `@fontsource-variable/*` (Inter for UI, JetBrains
  Mono for numeric/tabular data) — no third-party font requests at runtime.

## Verified

`npx tsc --noEmit`, `npx next lint`, and `npx next build` all pass cleanly
against this codebase (11/11 routes prerender successfully). The chat
widget (`public/widget/widget.js`) was additionally tested with a jsdom
harness simulating a real visitor: opening the widget, starting a
conversation, sending a message, and — separately — a returning visitor
resuming their prior conversation from `localStorage` without creating a
duplicate ticket. All assertions passed, including graceful handling of
the Socket.IO CDN script failing to load.

- **Profile page**: the user menu's "Profile" and "Preferences" items now
  actually navigate (`/profile` shows account details; "Preferences" opens
  Settings) instead of doing nothing.
- **Teams**: create/delete teams, add/remove members (admin+, via a
  searchable popover over org users) — fully wired to the Phase 2 API.
- **Settings**: edit organization name/domain (admin+; read-only for other
  roles), view plan tier, and a theme picker.

## Known gaps (intentionally deferred)

- Billing/subscription management isn't built.
- No file/image attachment support in ticket messages or the widget yet.
