# @support-saas/api

Express + TypeScript core API: auth, multi-tenant RBAC, tickets, teams, orgs.

## Setup

```bash
# from repo root
npm install
npm run docker:up                 # starts Postgres, Redis, etc.
cd apps/api
npx prisma migrate dev --name init
npx prisma db seed                # optional demo data (see prisma/seed.ts)
npm run dev                       # http://localhost:4000
```

> **`.env` uses `localhost`, on purpose.** The checked-in `apps/api/.env` is
> written for running `npm run dev` directly on your machine (outside
> Docker) — Postgres/Redis/etc. are reachable at `localhost` because
> `docker-compose.yml` publishes their ports to your host. If you instead
> run the API *as a container* (`docker compose --profile apps up`), that
> container needs container hostnames (`postgres`, `redis`, ...) instead of
> `localhost` — `docker-compose.yml`'s `api`/`ai-service` services already
> set those via an `environment:` block that overrides the `.env` file, so
> you don't need to edit anything for either workflow to work.
>
> **If Prisma connects to some database you don't recognize** (e.g. a Neon/
> Supabase URL), you almost certainly have a `DATABASE_URL` (or `MONGO_URL`/
> `REDIS_URL`) environment variable already set in your shell/OS from a
> different project — actual environment variables silently take priority
> over `.env` file values. Check with `echo $env:DATABASE_URL` (PowerShell)
> or `echo $DATABASE_URL` (bash/zsh); if it prints something, `Remove-Item
> Env:DATABASE_URL` (PowerShell) or `unset DATABASE_URL` (bash/zsh) for the
> current session, or remove it from System Properties > Environment
> Variables to fix it permanently.

> `npx prisma generate` / `migrate` need outbound access to `binaries.prisma.sh`
> to download the query engine on first run — make sure that's reachable in
> your environment (it's not part of this repo's sandboxed dev network).

## Auth model

- **Access token**: short-lived JWT (default 15m), sent as `Authorization: Bearer <token>`.
- **Refresh token**: long-lived JWT (default 30d), stored as an `httpOnly` cookie
  scoped to `/api/auth`, and tracked in Redis by a per-token `tokenId` so it can
  be revoked/rotated. Every refresh call invalidates the old token id and issues
  a new one (rotation) — a replayed refresh token fails immediately.
- **Multi-tenancy**: every access token embeds `orgId`. Every service method
  filters by `orgId` from `req.auth` — there is no code path that reads across
  organizations.
- **RBAC**: roles are `owner > admin > agent > viewer`. `requireRole('admin')`
  gates a route to admin-or-higher; `requireAnyRole(...)` is available for
  non-hierarchical allow-lists.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | none | Creates a new org + owner user |
| POST | `/api/auth/login` | none | |
| POST | `/api/auth/refresh` | refresh cookie | Rotates the refresh token |
| POST | `/api/auth/logout` | refresh cookie | Idempotent |
| GET | `/api/auth/me` | access token | |
| GET | `/api/users` | access token | |
| GET | `/api/users/:id` | access token | |
| PATCH | `/api/users/:id/role` | admin+ | |
| DELETE | `/api/users/:id` | admin+ | Soft-deactivates |
| GET | `/api/orgs/current` | access token | |
| PATCH | `/api/orgs/current` | admin+ | |
| GET | `/api/teams` | access token | |
| POST | `/api/teams` | admin+ | |
| GET | `/api/teams/:id` | access token | |
| POST | `/api/teams/:id/members` | admin+ | |
| DELETE | `/api/teams/:id/members/:userId` | admin+ | |
| DELETE | `/api/teams/:id` | admin+ | |
| POST | `/api/tickets` | access token | |
| GET | `/api/tickets` | access token | Paginated, filterable |
| GET | `/api/tickets/:id` | access token | |
| PATCH | `/api/tickets/:id` | access token | |
| POST | `/api/tickets/:id/messages` | access token | |
| POST | `/api/tickets/:id/ai-suggest` | access token | Proxies to the AI service's RAG suggestion endpoint |
| GET | `/api/customers?search=` | access token | Used by the new-ticket dialog's customer picker |
| POST | `/api/customers` | access token | Creates a customer inline when starting a new ticket |
| GET | `/api/knowledge` | access token | |
| GET | `/api/knowledge/:id` | access token | |
| POST | `/api/knowledge` | admin+ | Publishing indexes the article into the AI service |
| PATCH | `/api/knowledge/:id` | admin+ | Re-syncs the AI index (or removes it if unpublished) |
| DELETE | `/api/knowledge/:id` | admin+ | Removes from Postgres and the AI index |
| GET | `/api/analytics/tickets-volume?days=14` | access token | Real daily created/resolved counts, aggregated from Kafka events |
| POST | `/api/widget/:orgSlug/conversations` | public (rate-limited) | Starts or resumes a visitor's conversation, issues a widget token |
| GET | `/api/widget/conversations/:ticketId` | widget token | Internal notes are always excluded |
| POST | `/api/widget/conversations/:ticketId/messages` | widget token | Customer sends a message |

## Kafka event pipeline (Phase 6)

The API publishes to Kafka best-effort (a broker outage never blocks a
request) whenever a ticket is created/updated or a message is sent —
topics and payload shapes are the `KAFKA_TOPICS`/`Kafka*Event` contracts in
`@support-saas/shared-types`. An in-process consumer (`src/worker/analytics-consumer.ts`,
started at boot, group id `analytics-consumer`) subscribes to
`ticket.created`/`ticket.updated` and increments daily Redis counters
(`analytics:created:{orgId}:{date}`, `analytics:resolved:{orgId}:{date}`),
which `GET /api/analytics/tickets-volume` reads — this is what powers the
dashboard's ticket-volume chart with real data instead of a demo series.
Set `KAFKA_ENABLED=false` to disable both the producer and consumer (the
app still runs fine; the chart just reads zeros).

## Chat widget auth (Phase 6)

Widget tokens are a **separate JWT type** signed with `WIDGET_JWT_SECRET`
(never the staff `JWT_ACCESS_SECRET`) and only ever resolve to
`{ customerId, orgId }` — there is no code path from a widget token to a
staff role. Socket.IO enforces the same boundary: widget sockets join a
`ticket:{id}:widget` room distinct from staff's `ticket:{id}` room, and the
server verifies ticket ownership before allowing a widget socket to join,
so a visitor can never eavesdrop on another customer's conversation by
guessing a ticket id. Internal notes are filtered out of every
widget-facing response and never broadcast to the widget room.

## AI service integration (Phase 5)

The API talks to `apps/ai-service` over HTTP (`AI_SERVICE_URL`), never
exposing it directly to the browser:

- **Knowledge sync**: creating/updating a knowledge article calls the AI
  service's indexing endpoint best-effort — if the AI service is down, the
  article still saves in Postgres with `vectorIndexed: false`, and a warning
  is logged. It never fails the user's request.
- **Auto-summarize**: creating a ticket with an initial customer message
  best-effort calls the AI service to populate `aiSummary`/`aiSentiment`.
  Same fire-and-forget policy — an AI hiccup never blocks ticket creation.
- **Suggested replies**: `POST /api/tickets/:id/ai-suggest` is user-initiated
  (an agent clicked "Suggest a reply"), so unlike the above it propagates a
  real error to the frontend if the AI service fails — the agent needs to
  know the suggestion didn't come through, not see nothing happen.

All responses use the shared `ApiResponse<T>` envelope from
`@support-saas/shared-types`: `{ success: true, data, meta? }` or
`{ success: false, error: { code, message, details? } }`.

## Realtime

Socket.IO is mounted at `/socket.io`, authenticated via the same access
token (`socket.handshake.auth.token`). On connect, a socket joins the
`org:{orgId}` room (org-wide ticket list updates) and can additionally join
per-ticket rooms for the detail view:

| Event (client → server) | Payload | Effect |
|---|---|---|
| `ticket:join` | `ticketId` | Joins `ticket:{id}`, broadcasts updated viewer count |
| `ticket:leave` | `ticketId` | Leaves the room, broadcasts updated viewer count |
| `ticket:typing:start` / `ticket:typing:stop` | `ticketId` | Relayed to everyone else in the room as `{ ticketId, userId, userName }` |

| Event (server → client) | Scope | Trigger |
|---|---|---|
| `ticket:created` | org | New ticket created |
| `ticket:updated` | org + ticket | Status/priority/assignee change |
| `ticket:message` | org + ticket | New reply or internal note |
| `ticket:typing:start` / `:stop` | ticket | Another viewer is composing |
| `ticket:presence` | ticket | Viewer count changed |

The display name attached to typing events is resolved once per connection
(a single DB lookup at handshake), not per keystroke.

## Testing

```bash
npm test   # vitest — 31 unit tests, ~2s, no live DB/Redis/Kafka required
```

Covers JWT sign/verify round-trips for all three token types (including the
critical isolation check that a widget token can never verify as a staff
access token), the RBAC role-hierarchy middleware, `AppError`'s status/code
mapping, and the analytics counter key helpers. Tests that need Prisma/
Redis/Kafka live behind `bestEffort()` wrappers or aren't yet covered here —
this suite exercises the pure logic layers, not full request/response
integration (there's no test database in CI yet).

## Database

Postgres via Prisma (`prisma/schema.prisma`). Ticket numbers are assigned
atomically per-org via an `Organization.nextTicketNumber` counter incremented
inside the same transaction that creates the ticket, so concurrent creates
never collide.
