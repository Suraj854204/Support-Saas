# Production guide (v10)

## Run locally

```bash
npm ci
cp .env.example apps/api/.env            # fill in values, see "Environment" below
cp apps/ai-service/.env.example apps/ai-service/.env
docker compose -f infra/docker/docker-compose.yml up -d     # databases + qdrant + redis ...
cd apps/api && npx prisma migrate deploy && cd ../..
npm run dev                                                  # api :4000, web :3000
cd apps/ai-service && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt \
  && .venv/bin/uvicorn app.main:app --port 8000
```

Python must be **3.12** (the pinned `llama-index-vector-stores-qdrant==0.4.2` does not install on 3.13).

## Test and build

```bash
npm run build --workspace=@support-saas/shared-types
npm test --workspace=@support-saas/api            # 332 unit tests
npm run build --workspace=@support-saas/api       # emits runnable JS (tsc + tsc-alias)
npm run build --workspace=@support-saas/web
cd apps/ai-service && python -m pytest             # 54 tests, no network needed
```

Docker images for `api` and `web` are built from the **repository root**:

```bash
docker build -f apps/api/Dockerfile -t support-saas-api .
docker build -f apps/web/Dockerfile -t support-saas-web --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .
docker build -t support-saas-ai apps/ai-service
```

## Environment (production)

The API **refuses to start** in production when any of these is missing or weak:

| Variable | How to get it |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WIDGET_JWT_SECRET` | three different values: `openssl rand -hex 32` |
| `SECURITY_HASH_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (encrypts Gmail tokens; the default is public) |
| `AI_SERVICE_TOKEN` | `openssl rand -hex 32`, **identical** in the API and the AI service |
| `SMTP_USER`, `SMTP_PASS`, `MAIL_DEV_LOG_ONLY=false` | your SMTP provider |
| `GOOGLE_API_KEY` (AI service) | https://aistudio.google.com/apikey |

The AI service also refuses to start with `ENVIRONMENT=production` and no `AI_SERVICE_TOKEN`.
Terraform generates the secrets (`secrets.tf`); you supply `google_api_key`, `smtp_user`, `smtp_pass`.

## AI replies on the chat widget

Settings → **AI replies on the chat widget**:

* **Off**: no AI on the widget.
* **Copilot** (default for every organization): visitors only get human replies; agents can ask for a draft.
* **Autopilot**: the AI answers visitors from published articles.

In every mode a serious message (defect, safety, legal, fraud, large amounts) starts the 24-hour contact clock.
In Autopilot the AI **never** resolves these by itself and hands over to a person:
refunds, payment disputes, account security, order lookups, complaints, explicit "talk to a human",
anything below the confidence threshold, an AI outage, and repeated unsuccessful attempts.
It never claims an action it did not perform.

Reliability: the customer message and the AI reply carry an idempotency key (`clientMessageId`,
unique per ticket). A retried request returns the original message and does not trigger a second AI reply.
Replies are stored first (`deliveryStatus = pending`), pushed over the widget socket, then marked `delivered`
(`failed` when the push throws; the widget also polls, so the visitor still receives it).
"Delivered" means stored and pushed to the visitor's session on the widget channel, not read.

## Billing, INR pricing, GST and pay-per-use (Stripe)

Plans, limits and prices live in one table: `apps/api/src/modules/billing/plans.data.ts`. `npm run stripe:setup`
creates the matching Stripe objects from it, so code and Stripe cannot drift apart.

| | Free | Starter | Growth | Scale (`enterprise` key) |
|---|---|---|---|---|
| Price / month, **excluding GST** | ₹0 | ₹99 (first month ₹9) | ₹999 | ₹19,999 |
| Team members (active + pending invites) | 2 | 5 | 20 | 100 |
| AI replies / month | 50 | 1,000 | 10,000 | 100,000 |
| Knowledge articles | 20 | 100 | 1,000 | 10,000 |
| Forms and assistants | 1 | 5 | 25 | 200 |
| Optional extra AI reply (excl. GST) | not offered | ₹1.00 | ₹0.60 | ₹0.40 |

These prices and limits are my proposal, not market-tested numbers. Change them in `plans.data.ts` and re-run the
setup script (it creates new Prices; archive old ones in Stripe yourself).

Setup (Stripe test mode first):
1. `STRIPE_SECRET_KEY=sk_test_... GST_PERCENT=18 npm run stripe:setup -w apps/api`. It creates products, INR prices
   (tax-exclusive), the usage meter, a GST Tax Rate and the Rs 9 intro coupon, then prints every `STRIPE_*` line to paste
   into your environment. Re-running reuses what exists. Confirm the GST rate with your accountant.
2. Webhook endpoint `https://<api>/api/billing/webhook` for `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`, `invoice.payment_failed` → `STRIPE_WEBHOOK_SECRET`.
3. In the Stripe Dashboard: add your legal name, address and **GSTIN** (Settings > Billing > Invoice > default account
   tax IDs) so invoices are valid GST invoices; enable the Customer Portal (invoice history, card updates, cancel).
4. Locally: `stripe listen --forward-to localhost:4000/api/billing/webhook`.

GST / tax:
* Prices exclude GST. Checkout adds GST using the fixed Tax Rate(s) in `STRIPE_TAX_RATE_IDS` on every line.
  Stripe Tax is not used because it cannot compute domestic Indian GST for an India-based seller.
* Checkout requires a billing address and lets the customer enter a GSTIN, which Stripe prints on the invoice.
* Whether intra-state (CGST+SGST) vs inter-state (IGST) splitting is needed depends on your registration; a single
  18% rate shows as "GST". Ask your accountant before going live. This is not tax advice.

Intro offer: Starter's first month is ₹9 via a Stripe coupon, offered only to an org that never subscribed.
Honest note: a ₹9 (+GST) charge can cost more in payment fees than it earns; it is a conversion tool, not revenue.

Pay-per-use AI replies (opt-in):
* Off by default. An owner/admin turns it on in Plan & billing. Needs an active paid plan.
* After the monthly allowance, each extra reply is counted atomically (capped at one extra allowance per month, so a
  loop or attack cannot create an unbounded bill) and sent to a Stripe Billing Meter as one event with the id
  `ovg:<org>:<month>:<unit>`. Retries, double flushes and crashes can never bill a unit twice; units that failed to send
  are re-sent by the background sweep (this month and last).
* With it off, or when the cap is reached, the widget hands the chat to a person as before.

Invoices and payment slips: Stripe issues, numbers and emails them. The billing page lists them with the hosted
invoice page and PDF links (the customer id comes from our own stored record, never from the request).

India payment rules to know: recurring card/UPI charges over ₹15,000 need the customer's approval each cycle
(e-mandate), so the Scale plan (₹19,999 + GST) renewal will ask the customer to approve; the page says so. Some
renewals can fail until approved, then `past_due` handling applies.

How it behaves:
* Only a signature-verified webhook changes a paid plan. The browser never does. The org is found by the Stripe
  customer id that the server stored at checkout; a subscription whose metadata names another org is ignored.
* Each Stripe event id is stored once, so retries are harmless; an older event arriving late never overwrites newer state.
* `active`, `trialing` and `past_due` keep the paid plan. `canceled`, `unpaid` and `incomplete_expired` return the org
  to Free. An unconfirmed payment never grants a plan.
* Limits only block **adding** more. Lowering a plan never deletes anything.
* The AI-reply allowance is one atomic SQL statement (40 concurrent writers vs limit 5: exactly 5 succeeded).
* A subscription whose base price id is not in `STRIPE_PRICE_*` is logged and ignored. The metered overage item may sit
  beside the base item in any order.
* Without `STRIPE_SECRET_KEY` the app runs on Free limits and billing endpoints answer 503.
* Only owners and admins (`manage_billing`) can open the billing page, start checkout or toggle pay-per-use.

Not included: per-seat metering, our own proration (the portal handles plan changes), credit notes/refund UI (use the
Stripe Dashboard), annual plans, multi-currency, e-invoicing (IRN) for large Indian sellers.

## Roles and access

| Role | Can do |
|---|---|
| viewer | Read tickets, customers, knowledge and analytics. **Cannot change anything.** |
| agent | Everything a viewer can, plus work tickets, add customers, edit customers, use canned responses and AI suggestions |
| admin | Plus merge, export and delete customers (personal data), manage knowledge, teams, integrations |
| owner | Plus billing and ownership changes |

Enforced on the server in the route files (`requireRole`), and covered by `middleware/__tests__/role-guards-http.test.ts`,
which calls the real routes with a viewer, agent and admin token.

## Sharing files in chat (customers and team)

Customers (in the chat widget) and the team (in the ticket reply box) can send photos, screenshots, videos, audio and
documents. Attach with the paperclip, paste a screenshot, or drag and drop. Up to 5 files per message.

* **Allowed (checked by file CONTENT, not the name or browser-reported type):** PNG, JPG, GIF, WebP; MP4, MOV, WebM;
  MP3, OGG, WAV, M4A; PDF, Word, Excel, PowerPoint (and OpenDocument), RTF; TXT, CSV, MD, JSON, LOG; ZIP.
  **Refused:** programs and scripts (exe, bat, js, sh, jar, apk...), HTML/SVG/XML, macro-enabled Office files, and anything
  whose content does not match an allowed type (a renamed .exe is still refused). "invoice.pdf.exe" is refused.
* **Limits:** 10 MB per file, 50 MB for video (`CHAT_UPLOAD_MAX_MB`, `CHAT_UPLOAD_VIDEO_MAX_MB`); at most 20 unsent
  files per person per conversation; uploads are rate limited per IP.
* **Storage:** set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` and files are stored on
  Cloudinary as private ("authenticated") assets under `support-desk/<org>/`, never public URLs. Without them files go to
  local disk, which is lost when a container is replaced: use Cloudinary or a persistent volume in production. The
  API secret lives only on the server. Setting only some of the three refuses to start in production.
* **Viewing:** the API hands out short-lived (15 min) signed links bound to one file. Images, video and audio play in the
  page (with video seeking); documents download. A link works for anyone who holds it until it expires, so links are
  never stored and are re-issued every time a conversation is loaded. Cloudinary's own URL is never given to a browser.
* **Who can see what:** a customer only sees files in their own conversation; internal notes' files are never sent to
  customers; files can only be attached by the person who uploaded them, to a conversation they belong to.
* A message with only a file (no text) goes straight to the team: the AI auto-reply needs text and cannot read files.
* Unsent uploads are deleted after 24 hours by the background worker.

Not included, be aware: **no malware scanning** (Cloudinary offers paid scanning add-ons; a separate scanner such as
ClamAV in front of storage is the usual alternative), no image/video moderation, files are not attached to the emails
sent to customers who write in by email, and uploads are held in memory while being checked (fine for the limits above;
large traffic needs a streaming upload to Cloudinary).

## Call requests

A customer can tap "Request a call" in the chat widget and leave a phone number (and a best time). The team sees a
"Call requests" card on the dashboard with tap-to-call numbers and Done / No answer / Dismiss buttons; the conversation
gets a note and a `call-request` tag. One open request per conversation. **This tracks requests; it does not place
calls.** Calling from the browser (VoIP) needs a telephony provider such as Twilio or Exotel with its own account,
numbers and compliance setup; that is not included and was not verified.

## Security review notes (v14)

Fixed after review, each with a test: viewers could write data; login OTP guess limit could be beaten by parallel
requests; a ticket could be assigned to a user or team of another organization; attachment size limit trusted the
sender's declared size and download headers echoed unvalidated values. Reviewed and found sound: webhook SSRF guard
(blocked ranges, DNS pinned at connect time), automation actions, team membership checks, password reset tokens.
Not yet reviewed line by line: shopify, imports, email-integrations (Gmail OAuth), ai-insights, public-api.

## Customer satisfaction (CSAT)

* When a request is `solved` or `closed`, the customer's tracking page (the link in their email) shows a 1-5 star
  rating with an optional comment (max 1,000 characters). One rating per request; the customer can change it.
* Rating needs the tracking link only (no login). The link is the secret; a bad or expired link answers with a generic 404.
* Dashboard card "Customer satisfaction": average, share of 4-5 star ratings, distribution and recent comments
  (`GET /api/csat/summary?days=30`, any logged-in role, own organization only).
* Not included: sending a survey email automatically (customers rate from the tracking link they already have),
  per-agent CSAT, CSAT in automations.

## Embedding model and vector size

Default: `models/gemini-embedding-001`, 3072 dimensions. `text-embedding-004` was shut down on
2026-01-14. Changing the model changes the vector size: set `QDRANT_COLLECTION` to a new name and re-index
every article. The AI service refuses to use an existing collection whose vector size differs.

## Deploy (AWS)

1. `terraform apply` (needs AWS credentials; not run here).
2. Push to `main`: CI builds and tests, CD builds images and deploys to ECS.
3. Migrations: run `npx prisma migrate deploy` as a one-off task before the new API version takes traffic
   (the Kubernetes overlay has `migration-job.yaml`). All migrations in this release are additive, so rolling back the
   application image is safe.
4. The AI service is reachable only inside the VPC (`ai-service.<project>.local:8000`) and requires the token.

## Not verified here (needs real credentials or infrastructure)

Docker image builds (no Docker daemon in the authoring sandbox), `terraform validate/apply`, CI on GitHub,
a live Gemini/Qdrant round trip, live Stripe calls (`stripe:setup`, Checkout with GST, meter events, invoices list, Portal and real webhook delivery: use test mode and the Stripe CLI), SMTP delivery, Gmail OAuth, Shopify, and the Prisma drift check
(`prisma migrate diff`; the sandbox cannot download Prisma's schema engine). The migration SQL itself was applied in order
to a fresh PostgreSQL 16 and checked.

## Known gaps

Attachment malware scanning, an email channel for AI replies, order lookups against
Shopify from chat, CSAT surveys, and AI cost dashboards are not implemented in this release.
