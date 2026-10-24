<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=230&section=header&text=Loop&fontSize=80&fontAlignY=38&animation=fadeIn&desc=AI-Powered%20Multi-Tenant%20Customer%20Support%20Platform&descAlignY=60&descSize=20" alt="Loop banner" width="100%"/>

<a href="https://github.com/Suraj854204/Support-Saas">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&duration=3200&pause=900&color=6366F1&center=true&vCenter=true&width=760&lines=Real-time+agent+desk+%2B+embeddable+chat+widget;AI+reply+assistant+with+RAG+and+a+semantic+cache;INR+billing+with+GST%2C+overage+and+invoices;Secure+file+sharing+for+customers+and+agents;Multi-tenant+by+design+with+role-based+access" alt="Typing animation of project highlights"/>
</a>

<br/>

[![CI](https://github.com/Suraj854204/Support-Saas/actions/workflows/ci.yml/badge.svg)](https://github.com/Suraj854204/Support-Saas/actions)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-API-404d59?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-AI%20service-009688?logo=fastapi&logoColor=white)
![Java](https://img.shields.io/badge/Java-17-ed8b00?logo=openjdk&logoColor=white)
![Kafka](https://img.shields.io/badge/Kafka-events-231f20?logo=apachekafka&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-cache-dc382d?logo=redis&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-billing-635bff?logo=stripe&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-ef4444?logo=turborepo&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-22c55e)

**[Features](#-features) · [Screenshots](#-screenshots) · [Architecture](#-architecture) · [Quick start](#-quick-start) · [Configuration](#️-configuration) · [Deployment](#️-deployment) · [Troubleshooting](#-troubleshooting)**

</div>

---

## 📖 Overview

**Loop** is a multi-tenant customer support SaaS in the style of Zendesk or Intercom. Support teams get a real-time
agent desk; their customers get an embeddable chat widget. An AI assistant drafts replies from each organization's
own knowledge base, and a semantic cache avoids paying for the same answer twice.

It is a polyglot monorepo: a **Next.js 15** dashboard, an **Express + Prisma** API, a **FastAPI** AI service and a
**Java Spring Boot** semantic cache, connected through PostgreSQL, Redis, Kafka and Qdrant.

> [!NOTE]
> This is a learning and portfolio project. Stripe, Cloudinary and Gemini integrations are covered by automated
> tests with mocks; they have **not** been verified against live accounts in this repository. See
> [Known limitations](#️-known-limitations).

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🎧 Support desk
- Multi-tenant organizations
- Roles: `viewer`, `agent`, `admin`, `owner`
- Tickets, customers, teams
- Canned responses, macros, automations
- SLA tracking and breach alerts
- Real-time updates over Socket.IO
- Gmail and Shopify integrations
- CSV imports, outbound webhooks, public API keys

</td>
<td width="50%" valign="top">

### 💬 Chat and customer experience
- Embeddable chat widget
- File sharing for customers and agents (images, video, audio, PDF, Office, text)
- CSAT rating through the ticket tracking link
- Call requests from the widget
- Typing indicators with a polling fallback

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🤖 AI
- Reply suggestions and auto-replies with retrieval from Qdrant
- Gemini through LangChain, indexing with LlamaIndex
- Semantic response cache (Bloom filter, LSH, cosine similarity)
- Plan-based AI reply quotas with optional overage

</td>
<td width="50%" valign="top">

### 💳 Billing
- Stripe subscriptions in INR
- Plans: Free, Starter, Growth, Scale
- GST handling and GSTIN collection
- Usage-based overage with idempotent meter events
- Invoice list with hosted and PDF links

</td>
</tr>
</table>

---

## 🖼 Screenshots

<details open>
<summary><b>Click to collapse or expand the gallery</b></summary>
<br/>

<table align="center">
<tr>
<td align="center"><img src="./apps/web/image/img.png" alt="Screenshot 1" width="320"/></td>
<td align="center"><img src="./apps/web/image/img1.png" alt="Screenshot 2" width="320"/></td>
<td align="center"><img src="./apps/web/image/img2.png" alt="Screenshot 3" width="320"/></td>
</tr>
<tr>
<td align="center"><img src="./apps/web/image/img3.png" alt="Screenshot 4" width="320"/></td>
<td align="center"><img src="./apps/web/image/img4.png" alt="Screenshot 5" width="320"/></td>
<td align="center"><img src="./apps/web/image/img5.png" alt="Screenshot 6" width="320"/></td>
</tr>
<tr>
<td align="center"><img src="./apps/web/image/img6.png" alt="Screenshot 7" width="320"/></td>
<td align="center"><img src="./apps/web/image/img7.png" alt="Screenshot 8" width="320"/></td>
<td align="center"><img src="./apps/web/image/img8.png" alt="Screenshot 9" width="320"/></td>
</tr>
<tr>
<td align="center"><img src="./apps/web/image/img9.png" alt="Screenshot 10" width="320"/></td>
<td align="center"><img src="./apps/web/image/img10.png" alt="Screenshot 11" width="320"/></td>
<td align="center"><img src="./apps/web/image/img11.png" alt="Screenshot 12" width="320"/></td>
</tr>
<tr>
<td align="center"><img src="./apps/web/image/img12.png" alt="Screenshot 13" width="320"/></td>
<td align="center"><img src="./apps/web/image/img13.png" alt="Screenshot 14" width="320"/></td>
<td align="center"><img src="./apps/web/image/img14.png" alt="Screenshot 15" width="320"/></td>
</tr>
<tr>
<td align="center"><img src="./apps/web/image/img15.png" alt="Screenshot 16" width="320"/></td>
<td align="center"><img src="./apps/web/image/img16.png" alt="Screenshot 17" width="320"/></td>
<td align="center"><img src="./apps/web/image/img17.png" alt="Screenshot 18" width="320"/></td>
</tr>
<tr>
<td align="center"><img src="./apps/web/image/img18.png" alt="Screenshot 19" width="320"/></td>
<td align="center"><img src="./apps/web/image/img19.png" alt="Screenshot 20" width="320"/></td>
<td align="center"><img src="./apps/web/image/img20.png" alt="Screenshot 21" width="320"/></td>
</tr>
</table>

</details>

---

## 🏗 Architecture

```mermaid
flowchart TB
    subgraph Clients
        A[Agent Desk<br/>Next.js]
        W[Chat Widget<br/>widget.js]
    end

    A -->|HTTPS + WebSocket| API
    W -->|HTTPS + WebSocket| API

    subgraph Core
        API[API<br/>Express + Prisma<br/>auth, RBAC, tickets, billing, files]
        WK[Background workers<br/>SLA, email outbox, Gmail sync,<br/>webhooks, overage, upload sweep]
    end

    API --- WK
    API --> PG[(PostgreSQL)]
    API --> RD[(Redis)]
    API --> KF[[Kafka<br/>analytics events]]
    API -->|X-Internal-Token| AI

    subgraph AI layer
        AI[AI service<br/>FastAPI, LangChain, LlamaIndex]
        SC[Semantic cache<br/>Java: Bloom + LSH + cosine]
        QD[(Qdrant<br/>vector store)]
    end

    AI <--> SC
    AI --> QD
    AI -->|LLM calls| GM[Google Gemini]

    API -->|signed file links| ST[(Cloudinary or local disk)]
    API -->|subscriptions, meters, invoices| SP[Stripe]
```

The semantic cache is an optimization, not a dependency. If it is down or slow, the AI service answers through
the normal RAG pipeline.

### Reply flow with the semantic cache

A cache hit requires identical conditions: same organization, model, prompt, knowledge-base version and retrieval
settings. Lookup runs a Bloom filter check, then locality-sensitive hashing for candidates, then an exact cosine
similarity check against a configurable threshold.

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant API as API
    participant AI as AI service
    participant SC as Semantic cache
    participant Q as Qdrant
    participant L as Gemini

    C->>API: Message
    API->>AI: Suggest reply (org, message)
    AI->>SC: Lookup (embedding + conditions)
    alt Cache hit
        SC-->>AI: Cached answer
    else Cache miss
        AI->>Q: Retrieve knowledge-base context
        AI->>L: Generate answer
        L-->>AI: Answer
        AI->>SC: Store answer
    end
    AI-->>API: Reply
    API-->>C: Reply via Socket.IO
```

### Chat file upload flow

```mermaid
sequenceDiagram
    autonumber
    participant U as Customer or agent
    participant API as API
    participant S as Storage
    participant DB as PostgreSQL

    U->>API: Upload file (multipart)
    API->>API: Check size, sniff magic bytes, block unsafe types
    API->>S: Store privately
    API->>DB: Save pending attachment
    API-->>U: attachmentId
    U->>API: Send message with attachmentIds
    API->>DB: Link attachments to message
    API-->>U: Message with signed, expiring file links
```

---

## 🧰 Tech stack

| Layer | Technology |
| --- | --- |
| Web | Next.js 15 (App Router), React 19, Tailwind CSS, TanStack Query, Redux Toolkit, Socket.IO client |
| API | Node.js 20+, Express, TypeScript, Prisma, Zod, Socket.IO, KafkaJS |
| AI service | Python 3.11+, FastAPI, LangChain (Google Gemini), LlamaIndex, Qdrant client, pytest |
| Semantic cache | Java 17, Spring Boot |
| Data | PostgreSQL, Redis, Kafka, Qdrant |
| Payments | Stripe (subscriptions, billing meters, tax rates) |
| Files | Cloudinary (private assets) or local disk |
| Tooling | Turborepo, Vitest, ESLint, Prettier, GitHub Actions |
| Infrastructure | Docker, Terraform (AWS ECS Fargate), Kubernetes manifests |

---

## 📂 Repository layout

```text
.
├── apps/
│   ├── api/                  Express + TypeScript + Prisma API, Socket.IO, workers
│   │   ├── prisma/           Schema and migrations
│   │   └── src/
│   │       ├── modules/      tickets, customers, billing, csat, widget, chat-attachments, ...
│   │       ├── middleware/   auth, roles, rate limits, validation
│   │       ├── sockets/      real-time rooms and events
│   │       └── worker/       SLA, email outbox, Gmail sync, webhook delivery
│   ├── web/                  Next.js 15 dashboard and embeddable widget
│   │   └── public/widget/    widget.js, assistant.js, demo pages
│   ├── ai-service/           FastAPI service (RAG, suggestions, cache client)
│   └── semantic-cache/       Java semantic cache (Bloom filter, LSH, cosine)
├── packages/
│   ├── config/               Shared TypeScript and ESLint config
│   └── shared-types/         Types shared by API and web
├── infra/
│   ├── docker/               Local docker-compose stack and nginx config
│   ├── terraform/            AWS infrastructure as code
│   └── k8s/                  Kubernetes base manifests and overlays
├── docs/                     PRODUCTION.md, INTEGRATIONS.md
├── image/                    README screenshots
├── .github/workflows/        ci.yml, cd.yml
└── turbo.json
```

---

## 🗃 Data model

PostgreSQL through Prisma, with versioned migrations in `apps/api/prisma/migrations`. Every tenant-owned record is
scoped by `orgId`.

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : has
    ORGANIZATION ||--o{ CUSTOMER : has
    ORGANIZATION ||--o{ KNOWLEDGE_ARTICLE : owns
    ORGANIZATION ||--o| SUBSCRIPTION : bills
    CUSTOMER ||--o{ TICKET : opens
    USER ||--o{ TICKET : "assigned to"
    TICKET ||--o{ TICKET_MESSAGE : contains
    TICKET_MESSAGE ||--o{ ATTACHMENT : carries
    TICKET ||--o| CSAT_RESPONSE : "rated by"
    TICKET ||--o{ CALL_REQUEST : "may have"
```

---

## 🔐 Security

| Area | What is in place |
| --- | --- |
| Authentication | JWT access and refresh tokens, email OTP login with attempt limits, trusted-device cookies |
| Authorization | Role checks (`requireRole`, `requirePermission`) and `orgId` scoping on every route |
| Concurrency | OTP attempts reserved and consumed with atomic conditional updates |
| Files | Magic-byte detection; blocked executables, scripts, HTML, SVG, XML, macro Office files and double extensions |
| File delivery | 15-minute HMAC-signed links, `nosniff`, sandbox CSP, inline display only for image, video and audio |
| Secrets at rest | AES-256-GCM for stored secrets such as OAuth tokens (`ENCRYPTION_KEY`) |
| HTTP hardening | `helmet`, rate limiting (with a dedicated upload limiter), Zod input validation |
| Startup checks | Production refuses weak or missing secrets and partial Cloudinary configuration |

Report vulnerabilities privately to the maintainer instead of opening a public issue.

---

## 🚀 Quick start

### Prerequisites

- Node.js 20+ and npm 10+
- Docker Desktop (PostgreSQL, Redis, Kafka, Qdrant and others)
- Python 3.11+ to run the AI service outside Docker
- JDK 17 to run the semantic cache outside Docker

### Run locally

```bash
# 1. Clone
git clone https://github.com/Suraj854204/Support-Saas.git
cd Support-Saas

# 2. Configure the environment
cp .env.example .env            # fill in the values you need

# 3. Start local infrastructure
npm run docker:up

# 4. Install dependencies
npm install

# 5. Apply database migrations and generate the Prisma client
cd apps/api
npx prisma migrate deploy
npx prisma generate
cd ../..

# 6. Start all services
npm run dev
```

| Service | URL |
| --- | --- |
| Web (agent desk) | http://localhost:3000 |
| API | http://localhost:4000 |
| AI service | http://localhost:8000 |

> [!TIP]
> `AI_SERVICE_TOKEN` can be empty in development only. In production it must be 24+ characters. Generate one with
> `openssl rand -hex 32` and use the same value for the API and the AI service.
> Without Cloudinary variables, chat files are stored on local disk.

---

## ⚙️ Configuration

Copy `.env.example` and fill in what you need.

| Group | Variables |
| --- | --- |
| Database and cache | `DATABASE_URL`, `REDIS_URL`, `KAFKA_BROKERS`, `QDRANT_URL` |
| Auth and security | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WIDGET_JWT_SECRET`, `SECURITY_HASH_SECRET`, `ENCRYPTION_KEY` |
| App URLs | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AI_URL`, `API_PUBLIC_URL` |
| AI | `GOOGLE_API_KEY`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN` |
| Semantic cache | `SEMANTIC_CACHE_ENABLED`, `SEMANTIC_CACHE_URL`, `SEMANTIC_SIMILARITY_THRESHOLD`, `LSH_*`, `BLOOM_*` |
| Email and OAuth | `SMTP_*`, `MAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `STRIPE_TAX_RATE_IDS`, `STRIPE_METER_EVENT_NAME` |
| Chat files | `CLOUDINARY_*`, `CHAT_UPLOAD_MAX_MB`, `CHAT_UPLOAD_VIDEO_MAX_MB` |

> [!WARNING]
> Never commit a real `.env`. Rotate any credential that was ever shown in a log, screenshot or chat.

---

## 💳 Billing

| Plan | Price (per month, excl. GST) |
| --- | --- |
| Free | ₹0 |
| Starter | ₹99 (intro price ₹9 for the first month) |
| Growth | ₹999 |
| Scale | ₹19,999 |

- GST is applied through fixed Stripe Tax Rate IDs; GSTIN can be collected at checkout.
- Overage is opt-in and billed per extra AI reply through a Stripe Billing Meter. Each event carries an idempotent
  identifier (`ovg:<org>:<period>:<unit>`), and overage is capped at one extra allowance per month.
- Invoices come from Stripe with hosted and PDF links.
- One-time setup: `npm run stripe:setup -w apps/api`.
- Renewals above ₹15,000 may need customer authentication under RBI e-mandate rules.

---

## 📎 Chat file sharing

- Upload first, attach on send. Limits: 20 pending files per uploader, 5 files per message; unlinked files are
  swept after 24 hours.
- File type is decided by **magic bytes**, never by file name or client MIME type.
- Size limits: 10 MB per file and 50 MB for video, both configurable.
- Storage: Cloudinary (private assets fetched server-side) with local disk as a fallback.

---

## 🧪 Testing and quality

```bash
npm test            # all workspaces
npm run lint
npm run type-check
npm run build
```

- **API:** Vitest unit tests and HTTP-level tests with a real Express app (roles, uploads, signed links, range requests)
- **AI service:** pytest
- **CI:** `.github/workflows/ci.yml` builds, type-checks and tests on every push and pull request

---

## ☁️ Deployment

| Option | When to use |
| --- | --- |
| **Single server with Docker Compose** | A handful of users. Cheapest and simplest. |
| **Terraform on AWS** (`infra/terraform`) | Larger setups: VPC, ALB, ECS Fargate, RDS, ElastiCache, MSK, KMS, Secrets Manager, ECR, GitHub OIDC. |
| **Kubernetes** (`infra/k8s`) | Base manifests and overlays for your own cluster. |

See [`docs/PRODUCTION.md`](./docs/PRODUCTION.md) for secrets, billing setup, roles, CSAT, file sharing and
security notes.

> [!IMPORTANT]
> The Terraform stack defines DocumentDB and OpenSearch, which the application code does not currently use.
> Remove them before applying if you do not need them. The Terraform and Kubernetes files are a starting point;
> review and test them in your own environment before relying on them.

---

## 🩺 Troubleshooting

<details>
<summary><b><code>P1001 Can't reach database server</code> (Neon)</b></summary>

The free-tier compute was asleep. Wait a few seconds and retry, and add `connect_timeout=30` to `DATABASE_URL`.
</details>

<details>
<summary><b>Next.js <code>JavaScript heap out of memory</code></b></summary>

Start the web app through the repo's `dev` script, which sets a 4 GB heap. Delete `apps/web/.next` and restart.
</details>

<details>
<summary><b><code>ReferenceError: require is not defined</code> in <code>tailwind.config.ts</code></b></summary>

Use an ES import: `import animate from "tailwindcss-animate"` and `plugins: [animate]`.
</details>

<details>
<summary><b>Attachments fail after upgrading</b></summary>

In `apps/api` run `npm install`, `npx prisma migrate deploy` and `npx prisma generate`, then restart the API and
hard-refresh the browser so the latest `widget.js` loads.
</details>

<details>
<summary><b>Kafka warnings on start</b></summary>

Kafka is not running locally. Chat keeps working; only the analytics volume chart shows zeros.
</details>

---

## ⚠️ Known limitations

- No malware scanning for uploaded files, and files are not attached to outbound emails.
- Call requests are tracked only. There is no in-app calling or VoIP.
- Stripe, Cloudinary and Gemini are covered by mocked tests and have not been verified with live accounts here.
- Shopify, imports, Gmail OAuth and the public API have not had a deep security review yet.

---

## 🗺 Roadmap

- [ ] Malware scanning for uploads
- [ ] Attach chat files to outbound emails
- [ ] Load and accuracy benchmarks (API latency, cache hit rate, AI answer quality)
- [ ] Verify billing, file storage and AI against live accounts
- [ ] Voice or video calling for call requests

---

## 🤝 Contributing

1. Fork the repository and create a branch: `git checkout -b feature/my-change`
2. Make your change with tests, then run `npm run lint`, `npm run type-check` and `npm test`
3. Open a pull request describing what changed and why

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.

<details>
<summary><b>Read the full license text</b></summary>

```text
MIT License

Copyright (c) 2026 Suraj Kumar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>

---

<div align="center">

**Built by [Suraj](https://github.com/Suraj854204)**

<img src="https://img.shields.io/badge/Built%20with%20%E2%9D%A4%20by-Suraj-6366f1?style=for-the-badge" alt="Built with love by Suraj"/>

⭐ If you found this project useful, consider giving it a star.

</div>
