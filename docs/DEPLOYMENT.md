# DEPLOYMENT.md — Production Deployment Architecture

> Phase 19 production deployment. All critical checks must pass before going live.

---

## 1. Topology

```text
┌────────────────────┐
│     CDN / WAF      │  (static assets, TLS, bot mitigation, DDoS protection)
└───────┬────────────┘
        │
        │ HTTPS
        │
┌────────────────────┐
│   Next.js (frontend)│  App Router, ISR/SSR, Tailwind, shadcn/ui
│   (static + SSG/SSR)│
└───────┬────────────┘
        │
        │ /api/v1
        │
┌────────────────────┐
│  API Gateway / ALB │  Routing, TLS termination, WAF rules
└───────┬────────────┘
        │
        │ HTTPS + mTLS optional
        │
┌────────────────────┐
│   NestJS (backend) │  Stateless container, Horizontally scalable
│   + BullMQ worker  │
└───────┬────────────┘
        │
        │
┌────────────────────┐         ┌────────────────────┐
│   PostgreSQL       │         │   Redis            │
│   (managed)        │  ←→────│   (managed)        │
│   PITR daily       │  BullMQ │  Cache + Rate-limit│
│   Backups hourly   │         │  + Queue           │
└───────┬────────────┘         └────────────────────┘
        │
        │
┌───────▼─────────────────────┐
│   S3-Compatible (object store)│
│   Private bucket + Public CDN │
│   Presigned URLs for admin    │
└───────────────────────────────┘
```

## 2. Components

| Component           | Production Choice                       | Notes                                                                      |
|---------------------|-----------------------------------------|----------------------------------------------------------------------------|
| Frontend host       | PaaS (Vercel/Netlify/Cloudflare Pages) | ISR/SSR for SEO + share pages; edge TLS                                    |
| Backend             | Container (Docker / K8s / Fly.io)       | Stateless; scale horizontally; health checks                               |
| Database            | Managed PostgreSQL (Supabase/RDS/Neon)  | Daily backups + PITR; read replicas for analytics                          |
| Redis               | Managed Redis                           | BullMQ + cache + rate-limit; persistence enabled                           |
| Object storage      | S3-compatible (AWS R2 / Cloudflare R2)  | Private bucket + public CDN; no egress fees (R2)                           |
| Workers             | BullMQ consumers in separate process      | Separate replicas when needed; concurrency config                          |
| Monitoring          | Structured logs → collector; Sentry errors; Prometheus + Grafana | Job + webhook monitoring; synthetic checks                                |
| CI/CD               | GitHub Actions                          | lint → typecheck → test → build → migration validation → deploy           |

## 3. Environments

| Environment | Description                              | Services                          |
|-------------|------------------------------------------|-----------------------------------|
| `local`     | Docker Compose (postgres, redis, minio)  | Full local dev stack              |
| `staging`   | Mirror of prod; sandbox PSP (M-Pesa sandbox) | Same topology, fake payments      |
| `production`| Managed services; real PSP (M-Pesa live) | Real money flows, real AI calls    |

**Environment variable separation:**
- `.env.local` — local Docker Compose (gitignored)
- `.env.staging` — staging secrets from secret manager
- `.env.production` — production secrets from platform secret manager **never committed**

**Never use production credentials locally.** Use the `APP_ENV` variable to guard production-only behavior.

## 4. CI/CD Pipeline

```text
PR          │ lint → typecheck → tests → build → migration validation
            │                                        │
main        │                                        ▼
            │                               ┌─────────────────────┐
            └───────────────┐               │  DEPLOY to staging  │
                          ▼               └─────────────────────┘
                       tests ───────► push image ──────► deploy
                                              │
                                      ┌─────────────────────┐
                                      │  PROMOTE to production │
                                      │ (with 'promote-to-prod' tag)│
                                      └─────────────────────┘
```

**Pipeline steps:**
1. **Lint** — ESLint on both apps
2. **Typecheck** — TypeScript compiler on both apps
3. **Tests** — Jest (API) + Vitest (Web); integration tests run
4. **Build** — `nest build` + `next build`; Docker image build (`apps/api/Dockerfile`, `apps/web/Dockerfile`)
5. **Migration validation** — Prisma `migrate diff` + `prisma generate`; no destructive changes
6. **Production readiness gate** — `node scripts/prod-check.js` (critical checks must pass)
7. **Deploy** — Push image to registry; apply migrations via `Prisma migrate deploy`; deploy to staging; health-gate (`/api/v1/health` → 200, `/api/v1/health/ready` → ok); prompt for production promotion

**Key practices:**
- Migrations applied via `Prisma migrate deploy` in deploy step (not auto in app)
- Secrets injected via platform secret manager; never in image
- Production deploy requires explicit `promote-to-prod` tag or workflow dispatch
- Post-deploy health check: `/api/v1/health` must return `200`

## 5. Scalability Path

- Read replicas for `analytics`/`search` later
- Extract hot modules (payments, notifications) to services when load warrants
- Search → OpenSearch/Elasticsearch behind the same `search` module interface
- Multi-region only if data-residency requires (open question)

## 6. Observability

- **Structured logs** (JSON in production via `AppLoggerService`) → log collector (Datadog/Logtail)
- **Error tracking** (Sentry) — capture exceptions, breadcrumbs, performance
- **API latency** — Prometheus histograms on `/api/v1/health` and key endpoints
- **Metrics endpoint** — `GET /api/v1/health/metrics` (Prometheus exposition: uptime, db_up, redis_up; restrict to scraper network)
- **DB metrics** — pg_stat statements, connection pool, replication lag
- **Redis metrics** — key space hits, memory usage, latency p99
- **BullMQ dashboard** — job progress, failed jobs, queue depth
- **Payment webhook monitors** — idempotency + signature verification + replay guard
- **Synthetic checks** — critical flows (health, booking, payment) every minute
- **Audit logging** — append-only `AuditLog`; all sensitive actions logged (who/what/before/after/ip)

## 7. Production Checklist (gate: `npm run prod:check`)

| # | Check | How it is verified |
|---|-------|--------------------|
| 1 | HTTPS | TLS terminated at CDN/ALB; HSTS (`max-age=31536000`) on API + web in prod |
| 2 | Secure headers | API: helmet (CSP `default-src 'none'`, frame deny); Web: CSP, `DENY` framing, nosniff, referrer-policy |
| 3 | Authentication | JWT access+refresh, rotation schedule; weak secrets refuse boot (`assertProductionSecrets`) |
| 4 | Authorization | RBAC guards; AuditLog restricted to `SUPER_ADMIN` |
| 5 | Webhooks | Raw-body HMAC verification; replay guard; invalid-signature alerts |
| 6 | Payment verification | `MPESA_WEBHOOK_SECRET` required in prod (boot warning otherwise); sandbox in staging |
| 7 | Error handling | Global exception filter; no stack/PII leaks in prod responses |
| 8 | Backups | Managed PG PITR + daily snapshots; weekly restore drill (see OPERATIONS.md) |
| 9 | Logging | JSON lines in prod; PII redaction per SECURITY.md |
| 10 | Alerts | Thresholds in OPERATIONS.md §9; `#alerts` channel |
| 11 | SEO | Metadata + `robots.ts` + `sitemap.ts` |
| 12 | Mobile responsiveness | Viewport metadata; responsive Tailwind layouts |
| 13 | Accessibility | `lang="en"`, skip-to-content link, labelled form controls |

> Do not claim production-ready until `node scripts/prod-check.js` reports
> zero CRITICAL failures **and** every row above has been verified in staging.