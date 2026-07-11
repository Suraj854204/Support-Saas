# Support SaaS — Enterprise AI Customer Support Platform

SupportFlow is a customer support management application where teams can
manage tickets, customers, internal notes, knowledge articles and AI-assisted
reply suggestions.

## Architecture

```
support-saas/
├── apps/
│   ├── web/           Next.js 15 + React 19 dashboard, agent workspace, widget (Phase 3)
│   ├── api/            Express + TypeScript core API: auth, tickets, teams, billing (Phase 2)
│   └── ai-service/     FastAPI + LangChain/LlamaIndex RAG + AI reply engine (Phase 5)
├── packages/
│   ├── shared-types/   Domain entities, API envelope, Kafka event contracts
│   └── config/         Shared tsconfig + eslint bases
└── infra/
    ├── docker/         docker-compose.yml + nginx reverse proxy for local dev
    ├── terraform/      AWS infra (ECS Fargate + managed services) — the supported deploy path
    └── k8s/            Kustomize manifests — alternative path for teams already on Kubernetes
```

## Data layer responsibilities

| Store | Purpose |
|---|---|
| **PostgreSQL** | System of record: orgs, users, tickets, teams, billing |
| **MongoDB** | Chat transcripts, activity logs, unstructured attachments metadata |
| **Redis** | Sessions, cache, BullMQ job queues, rate limiting, Socket.IO adapter |
| **Elasticsearch** | Full-text search over tickets and knowledge base articles |
| **Qdrant** | Vector store for RAG (semantic search over KB for AI auto-replies) |
| **Kafka** | Event backbone: `ticket.*`, `message.*`, `ai.*` — decouples API from AI service and future analytics consumers |

## Build phases

- [x] **Phase 1 — Foundation**: monorepo, Docker Compose infra, shared types/config
- [x] **Phase 2 — Auth & core backend**: Express API, JWT auth, multi-tenant RBAC, ticket domain model
- [x] **Phase 3 — Dashboard shell**: Next.js + Shadcn design system, sidebar, command palette, dark/light mode
- [x] **Phase 4 — Ticketing core**: ticket detail thread, live typing indicators, presence, real-time ticket views
- [x] **Phase 5 — AI service**: FastAPI + LangChain RAG, auto-suggested replies, sentiment/summary
- [x] **Phase 6 — Messaging/inbox**: embeddable live chat widget, Kafka event pipeline, real analytics
- [x] **Phase 7 — Infra**: Terraform (AWS ECS Fargate), Kubernetes manifests (alternative), GitHub Actions CI/CD

## Deployment

Two independent, documented paths — pick one:

- **`infra/terraform`** (supported end-to-end, including CD): ECS Fargate +
  RDS/DocumentDB/ElastiCache/OpenSearch/MSK, deployed by
  `.github/workflows/cd.yml` via GitHub OIDC (no static AWS keys anywhere).
  See `infra/terraform/README.md` for bootstrap, cost, and security notes.
- **`infra/k8s`** (alternative, bring your own cluster): Kustomize manifests
  for teams already running EKS or another Kubernetes cluster. Not wired to
  the CD workflow — see `infra/k8s/README.md`.

`.github/workflows/ci.yml` runs on every push/PR regardless of which
deployment path you use: builds `shared-types`, lints + type-checks +
tests the API (31 Vitest unit tests) and the AI service (15 pytest tests),
lints + type-checks + builds the web app, and builds (but doesn't push) all
three Docker images.

## Running the foundation locally

Requires Docker + Docker Compose.

```bash
cp .env.example .env
npm install
npm run docker:up          # starts postgres, mongo, redis, elasticsearch, qdrant, kafka
```

Once Phase 2/3/5 land, add the `apps` profile to also boot the application
services and nginx:

```bash
docker compose -f infra/docker/docker-compose.yml --profile apps up -d
```

Service ports (local):

| Service | Port |
|---|---|
| Web (Next.js) | 3000 |
| API (Express) | 4000 |
| AI service (FastAPI) | 8000 |
| Postgres | 5432 |
| MongoDB | 27017 |
| Redis | 6379 |
| Elasticsearch | 9200 |
| Qdrant | 6333 | 6334 |
| Kafka | 9092 |
| Kafdrop (Kafka UI) | 9000 |
| Nginx (unified entry) | 80 |

## Conventions

- Workspaces managed by npm workspaces + Turborepo.
- All shared domain types live in `@support-saas/shared-types` — the API,
  frontend, and Kafka event payloads all import from here so shapes never
  drift.
- `packages/config` holds the base tsconfig/eslint every app extends, kept
  intentionally strict (`strict: true`, `noUncheckedIndexedAccess: true`).
