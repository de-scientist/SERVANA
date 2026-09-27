# SERVANA — AI-Powered Service Marketplace + Beauty Commerce

SERVANA is a production-grade, multi-sided marketplace connecting customers with
verified service providers for beauty & personal-care services, with an embedded
product commerce layer, loyalty, rankings, and an AI intelligence layer.

> **Current phase: PHASE 0 — Architecture & Blueprint.** No application code has
> been written yet. This repo currently contains the product specification
> (`AGENT.MD`) and the architecture documentation under `docs/`.

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Audit, target architecture, module map, roadmap |
| [docs/DATABASE.md](docs/DATABASE.md) | Data model, ERD, financial ledger design |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | Booking/payment state machines, commission, payouts |
| [docs/API.md](docs/API.md) | REST API contract (v1) |
| [docs/AI.md](docs/AI.md) | AI readiness & governance |
| [docs/SECURITY.md](docs/SECURITY.md) | Security architecture & threat model |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment topology (MVP) |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Environment configuration reference |

## Technology Stack (target)

* **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui,
  React Hook Form, Zod, TanStack Query.
* **Backend:** NestJS (modular monolith), TypeScript, Prisma.
* **Database:** PostgreSQL.
* **Cache/Queue:** Redis + BullMQ.
* **Storage:** S3-compatible object storage.
* **Infra:** Docker, managed PaaS/DB/Redis.

## Status

Greenfield. Phase 1 (Project Foundation) begins after Phase 0 approval — see
ARCHITECTURE.md §14.

## License

TBD.
