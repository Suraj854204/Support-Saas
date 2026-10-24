# Integrations, data import & AI trust layer

Everything here is **additive**: new tables, routes, workers and pages. Existing endpoints behave as before.
Apply the new migration (`apps/api/prisma/migrations/20261019000000_add_integration_trust_layer`) with `prisma migrate deploy`.

## Where to find it (dashboard)
- **Developers** → API keys, Webhooks, Shopify, Import (owner/admin)
- **AI insights** → Answers (why the AI said it, ratings) and Quality tests (owner/admin)
- Ticket page → 👍/👎 on AI suggestions; Orders panel when Shopify is connected

## Public API (`/api/public/v1`)
Auth with `X-API-Key: ssk_...` (or `Authorization: Bearer ssk_...`). Scopes: `tickets:read`, `tickets:write`. 120 req/min per key.

| Method | Path | Scope |
|---|---|---|
| POST | /tickets `{email, name?, subject, message, priority?}` | tickets:write |
| GET | /tickets, /tickets/:id | tickets:read |
| POST | /tickets/:id/messages `{body}` | tickets:write |

## Webhooks
Events: `ticket.created`, `ticket.updated`, `ticket.assigned`, `ticket.resolved`, `message.sent`, `customer.reply.received`.
Only events published through `publishEvent` fire. New chat-widget conversations now emit `ticket.created` too.
Delivery: signed, retried with exponential backoff (8 attempts), then marked `dead` (manual retry in the UI). Private/loopback addresses are blocked (SSRF).

Headers: `X-Support-Signature: t=<unix>,v1=<hex>`, `X-Support-Event`, `X-Support-Delivery`.
Verify (Node):
```js
const crypto = require("crypto");
function verify(secret, rawBody, header, tolerance = 300) {
  const p = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > tolerance) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${p.t}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(p.v1 ?? ""));
}
```
Use format **Slack** to post directly to a Slack incoming-webhook URL.

## Zendesk / CSV import
`POST /api/imports/tickets?dryRun=true|false` with `Content-Type: text/csv` (max 10 MB / 5000 rows). `dryRun` defaults to true.
Columns: `Ticket ID`, `Requester email`, `Subject` (required); `Requester`, `Description`, `Status`, `Priority`, `Created at` (optional).
Imported tickets keep original dates, are tagged `imported` + `zd-<id>` (re-running skips them), and do not trigger automations, AI, SLA timers or emails.

## Shopify
Connect a custom-app Admin API token (`read_orders`) under Developers → Shopify. Only `*.myshopify.com` hosts are ever called; the token is encrypted (AES-256-GCM).
`GET /api/shopify/orders?email=` returns a trimmed order view for agents.

## AI traces & quality tests
Every ticket "Suggest a reply" is recorded (question, reply, sources, confidence, latency). Agents rate it; admins filter by 👎 / declined / low confidence.
Quality tests are saved questions with must-contain / must-not-contain keywords or "should decline"; run them after knowledge-base edits (max 50 cases per run).

## Automation rules (extended)
Existing rules keep working unchanged. New building blocks:
- **Conditions:** customer is VIP, customer email domain, ticket age (hours, `>`/`<`), customer sentiment, assigned/unassigned; new operators `doesn't contain`, `more than`, `less than`.
- **Actions:** assign to agent (a specific agent or *least-loaded*, restricted to the ticket's team when it has members; only active agents/admins of your org), set status, add internal note, remove tag, stop running other rules.
- **Test on a ticket:** `POST /api/automations/:id/simulate {ticketId}` shows which conditions match and what would happen, without changing anything. Available from each rule card.
- **Recipes:** one-click starter rules (added switched off) on Settings → Automations.
Assignments by automation publish `ticket.assigned`, so webhooks fire for them too.

## Onboarding, macros and sample data

- **Welcome tour + Getting started checklist** (dashboard): per-browser flags in localStorage (`loop:onboarding:<userId>`); checklist items are computed from live data. Replay from Profile.
- **Guide** (Profile → Guide): animated, step-by-step help for every section.
- **Macros** (`/api/macros`, Settings → Macros): reply + status/priority + tags in one click. Applying a macro goes through the normal ticket service, so SLA, e-mails, webhooks and automations behave as for a manual action. `{{customer_name}}` and `{{agent_name}}` are filled in. Anyone who can reply can run macros; owners/admins edit them. Migration `20261020000000_add_macros` is additive.
- **Sample data** (`/api/demo-data`, owners/admins): adds 5 tickets tagged `demo` for customers on `demo.invalid` (a reserved domain that can never receive mail). Bypasses automations, e-mail, SLA and webhooks like the CSV import. `DELETE` removes only those tickets and customers.
- **Shortcuts**: press `?` anywhere in the app.

## Website forms (Form messages)

Customers' own websites can post a contact form straight into the helpdesk.

- **Create a form**: Form messages → Manage forms (owners/admins). Each form gets a public key (`frm_...`).
- **Submit**: `POST /api/public/forms/<publicKey>/submit` with JSON `{ "email", "message", "name?", "subject?", "fields?": { "Order number": "1042" }, "website?": "" }`. No API key needed in the browser; the public key can only submit, never read. Returns `{ success, data: { received, reference } }`.
- **Protection**: per-form switch (pause anytime), optional allowed-websites list (checked against the browser `Origin`), hidden `website` spam-trap field, 10 submissions/minute per visitor and form, blocked customers refused. Unknown and paused forms return the same error.
- **Result**: a normal ticket (channel `api`, tag `form:<id>`), created through the usual ticket service so SLA, AI summary and automations run. Extra `fields` are listed under the message.
- **View and filter**: Form messages page: by form, status, and text search across name, email and message.
- Migration `20261021000000_add_intake_forms` is additive. No existing endpoint changed.

### Google Forms

Form messages → Manage forms → New form → **Google Form**, paste the form's link. The card then shows a ready Google Apps Script (with the form's public key inside) and the 4 setup steps: Apps Script → paste → trigger `onFormSubmit` (From form, On form submit) → send a test response.

- The script picks Email / Name / Subject / Message by question title (falls back to the respondent email if "Collect email addresses" is on); every other answer goes into `fields` (max 10).
- If a response has no email, a placeholder `@google-form.invalid` address is used: the team can read it but cannot reply to that person.
- Google Forms are relayed by Google's servers (no browser `Origin`), so the allowed-websites list does not apply to them; the public key is the credential, and pausing the form stops it at once.
- The API must be reachable from the internet and `NEXT_PUBLIC_API_URL` must be set to its public address so the script contains the right URL.
- Migration `20261021010000_add_intake_form_source` is additive (`source`, `google_form_url`).

## AI website assistant, escalations and time filters

**AI assistant** (Form messages → Manage forms → New form → *AI assistant*): a chat bubble for any website.
- Embed: `<script src="https://APP/widget/assistant.js" data-key="frm_..." data-api="https://API" defer></script>` (`/widget/assistant-demo.html` shows it).
- Answers come from the organisation's **published** knowledge-base articles (same retrieval as agent suggestions). It never guesses: below 45% confidence or with no matching article it says so and offers a human.
- Serious matters skip the AI completely and go straight to a person (see below). Handoff creates a normal ticket (tag `form:<id>`, full chat transcript included) under Form messages.
- Public endpoints: `GET /api/public/assistant/<key>/config`, `POST /api/public/assistant/<key>/chat`. Limits: 20 messages/minute per visitor and key; same pause switch and allowed-websites list as forms.

**AI on every form ticket**: when the knowledge base matches, an *internal* "AI draft" note (with confidence and source articles) is added so an agent can reply in one click. It is never sent to the customer automatically.

**Escalations (24-hour contact promise)**: every form or assistant message is checked by plain, explainable rules (English + Hinglish): suspected defect, safety risk, legal/fraud wording, data leak (critical); double charge, urgent, threats to leave (strong); refund, damaged/missing, repeated attempts (mild, two together count); plus amounts (about 10,000 = high, 50,000+ = critical). A flagged ticket gets: priority raised (never lowered), tag `escalated`, a private note with the reasons, and a **contact-by deadline 24 hours later**. The deadline never restarts. The Escalations page (sidebar badge, red when overdue) lists them with a live countdown, Call (`tel:`), WhatsApp and Reply buttons, and *Mark as contacted* (call or message, with a note). The system does not place calls or send SMS itself.
- Forms accept `phone`, `contactPreference` (`call` | `message`) and `transcript`. The Google Form script detects phone and "call or message" questions by title.
- Manual escalation: `POST /api/escalations { ticketId, level?, reason? }`.

**Time filter**: Form messages → *Received in last* 24 hours, 2 to 9 days (API: `withinHours`, 1 to 720).

Migrations (all additive): `20261021010000_add_intake_form_source`, `20261021020000_add_ticket_escalations`.

**Housekeeping**: the API now type-checks cleanly (`npm run build` passes) and the web app builds with `next build`; earlier type and lint errors in untouched files were fixed without behaviour changes.
