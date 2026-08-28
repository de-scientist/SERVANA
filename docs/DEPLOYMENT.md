# DEPLOYMENT.md — Deployment Architecture (MVP)

> Phase 0 blueprint. Targets a pragmatic MVP; avoids over-engineering.

---

## 1. Topology

```
            ┌────────────┐
  Users ──▶ │  CDN/WAF   │  (static assets, Next.js, TLS, bot mitigation)
            └─────┬──────┘
                  │
            ┌─────▼──────┐        ┌──────────────┐
            │  Next.js   │◀───────│  API Gateway  │ (ALB / routing)
            │  (frontend)│   HTTPS │              │
            └────────────┘        └──────┬───────┘
                                         │ /api/v1
                                ┌────────▼────────┐
                                │  NestJS (mono)   │  container(s)
                                │  + BullMQ worker │
                                └──┬──────┬──────┬─┘
                                   │      │      │
                          ┌────────▼┐ ┌──▼───┐ ┌▼────────────┐
                          │ Postgres│ │ Redis│ │ S3-Compatible│
                          │(managed)│ │(mgd) │ │ (private+CDN)│
                          └─────────┘ └──────┘ └─────────────┘
```

## 2. Components

| Component | MVP choice | Notes |
|-----------|-----------|-------|
| Frontend host | Node server / PaaS (Vercel-like) | ISR/SSR for SEO + share pages. |
| Backend | Single NestJS container (replicas later) | Stateless; scale horizontally. |
| Database | Managed PostgreSQL (Supabase/RDS/Neon) | Daily backups + PITR. |
| Redis | Managed Redis | BullMQ + cache + rate-limit. |
| Object storage | S3-compatible (R2/S3/MinIO local) | Private docs + public image CDN. |
| Workers | BullMQ consumers in same deploy | Separate process/replicas when needed. |
| Monitoring | pino logs → collector; Sentry errors | Job + webhook monitoring. |
| CI/CD | GitHub Actions | lint → test → build image → deploy. |

## 3. Environments

* `local` — Docker Compose (postgres, redis, minio, app).
* `staging` — mirror of prod; sandbox PSP.
* `production` — managed services; real PSP (M-Pesa Daraja).

## 4. CI/CD Pipeline

```
PR ─▶ lint ─▶ typecheck ─▶ unit/integration tests ─▶ build image
                                                      │
                 main ─▶ tests ─▶ push image ─▶ deploy (staging ─▶ prod)
```

* Migrations applied via Prisma `migrate deploy` in deploy step (not auto in app).
* Secrets injected via secret manager; never in image.

## 5. Scalability Path

* Read replicas for `analytics`/search later.
* Extract hot modules (payments, notifications) to services when load warrants.
* Search → OpenSearch/Elasticsearch behind the same `search` module interface.
* Multi-region only if data-residency requires (open question).

## 6. Observability

* Structured logs (pino), error tracking (Sentry), API latency, DB metrics,
  BullMQ dashboard, payment-webhook monitors, synthetic checks on critical flows.
