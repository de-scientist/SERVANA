# ARCHITECTURE.md — SERVANA Platform

> **Phase 0 — System Architecture & Blueprint**
> Status: Draft for review. No implementation code is produced in this phase.

---

## 0. Executive Summary

SERVANA is intended to be a production-grade, AI-powered multi-sided marketplace
for beauty & personal-care services with an embedded product commerce layer.
This document defines the target architecture, module boundaries, data model,
state machines, security posture, and the implementation roadmap.

**Critical Phase 0 finding:** The repository contains **no application code**.
It holds only this spec (`AGENT.MD`) and a git repository. Therefore this phase
is a *greenfield blueprint*, not a refactor of existing software. All
architectural recommendations target a clean initial build using the prescribed
stack.

---

## 1. Repository Audit

### 1.1 What was inspected

| Item | Result |
|------|--------|
| Source code | None found |
| `package.json` / lockfiles | None |
| Framework (frontend/backend) | None |
| Database / ORM | None |
| CI/CD configuration | None |
| Docker / infra files | None |
| Tests | None |
| Docs (other than spec) | None |
| Environment config | None |

### 1.2 Findings

* **What already works:** Nothing runtime-related. The conceptual product
  specification (`AGENT.MD`) is detailed and internally consistent.
* **What is incomplete:** Everything. No scaffold exists.
* **What is broken:** N/A.
* **What is duplicated:** N/A.
* **What should be refactored:** N/A (greenfield).
* **What should be preserved:** The product vision, the role model
  (`User → Customer/Provider capabilities`), the money-handling rules, the
  event-driven orientation, and the AI-abstraction principle. All of these are
  sound and are encoded directly into this blueprint.
* **What should eventually be removed:** Nothing yet.

### 1.3 Audit conclusion

This is a **greenfield project**. The correct Phase 1 action is to scaffold the
monorepo (Next.js + NestJS + Prisma) with the structure defined in this
document, not to migrate or repair anything.

---

## 2. Technology Validation

The prescribed stack is validated against the requirements. No conflicting
technology currently exists in the repo, so there is nothing to migrate.

| Layer | Choice | Suitability | Notes |
|-------|--------|-------------|-------|
| Frontend framework | Next.js (App Router) | ✅ | SSR/SSG for SEO + shareable provider pages; RSC for performance. |
| UI | React + Tailwind + shadcn/ui | ✅ | Customizable design system foundation. |
| Forms/Validation | React Hook Form + Zod | ✅ | Zod schemas shared with backend for end-to-end validation. |
| Data fetching | TanStack Query | ✅ | Cache/invalidate server state on the client. |
| Backend | NestJS (modular monolith) | ✅ | Module boundaries map 1:1 to domain. Easy future extraction to services. |
| Language | TypeScript (strict) | ✅ | Shared DTO/entity types where practical. |
| Database | PostgreSQL | ✅ | Relational integrity is essential for money & bookings. |
| ORM | Prisma | ✅ | Schema-as-code, migrations, type safety. |
| Cache / Queue | Redis + BullMQ | ✅ | Idempotent webhooks, async jobs, ranking recompute. |
| Object storage | S3-compatible (MinIO locally, R2/S3 in prod) | ✅ | Verification docs, portfolio, product images. |
| AI | Provider abstraction | ✅ | `AIProvider` interface; swappable vendors. |

**Decision:** Adopt the prescribed stack as-is. No replacement is necessary.

---

## 3. Target System Architecture

### 3.1 Topology (Modular Monolith)

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js (App Router)  —  Customer / Provider / Admin UIs     │
│  TanStack Query · RHF · Zod · shadcn/ui                       │
└───────────────┬──────────────────────────────────────────────┘
                │  HTTPS  /api/v1/*
┌───────────────▼──────────────────────────────────────────────┐
│  NestJS (Modular Monolith)                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Domain Modules (each: controller/service/repo/events)   │  │
│  │ auth users customers providers verification categories  │  │
│  │ services availability bookings payments commissions     │  │
│  │ earnings payouts products inventory orders reviews      │  │
│  │ ratings loyalty referrals promotions notifications       │  │
│  │ messaging analytics search recommendations ai fraud     │  │
│  │ admin audit                                              │  │
│  └────────────────────────────────────────────────────────┘  │
│  Shared: Guards · Interceptors · EventBus · Money · Config     │
└───────┬───────────────────┬───────────────────┬──────────────┘
        │                   │                   │
   ┌────▼─────┐        ┌────▼─────┐        ┌────▼────────┐
   │PostgreSQL│        │  Redis   │        │ S3-Compatible│
   │ (Prisma) │        │ BullMQ   │        │ Object Store │
   └──────────┘        └──────────┘        └─────────────┘
```

The monolith is the *initial* deployment unit. Modules communicate **in-process**
today, but every cross-module interaction goes through an **application service
or the domain EventBus**, never by reaching into another module's database
tables directly. This keeps the future extraction to microservices cheap.

### 3.2 Module Responsibilities

| Module | Responsibility | Direct collaborators (read) |
|--------|----------------|------------------------------|
| `auth` | Identity, JWT/session, MFA, refresh rotation | users |
| `users` | Core user record, profile, preferences | — |
| `customers` | CustomerProfile, favourites, CRM view | users, bookings, loyalty |
| `providers` | ProviderProfile, mini-store, portfolio | users, verification, services |
| `verification` | KYC/identity/business verification workflow | providers, documents (S3) |
| `categories` | Taxonomy (beauty + future categories) | services |
| `services` | Service & ServiceOption catalog | categories, providers |
| `availability` | Working hours, slots, exceptions, conflict detection | providers, bookings |
| `bookings` | Booking lifecycle + state machine | availability, services, payments |
| `payments` | Payment initiation, provider adapters, webhooks, refunds | bookings, commissions |
| `commissions` | Configurable commission engine (snapshot at txn time) | payments |
| `earnings` | Immutable per-booking provider earning ledger | payments, commissions, payouts |
| `payouts` | Batch & manual payouts to providers | earnings, payments |
| `products` | Product & ProductVariant catalog | inventory, categories, orders |
| `inventory` | Stock, reservations, low-stock | products, orders |
| `orders` | E-commerce order lifecycle | products, inventory, payments |
| `reviews` | Reviews, ratings dimensions, moderation | bookings, providers, products |
| `ratings` | Aggregated/normalized quality signals | reviews, bookings |
| `loyalty` | Ledger-based points, tiers, rewards | customers, bookings, orders |
| `referrals` | Referral codes, attribution, abuse control | customers, loyalty |
| `promotions` | Coupons, campaigns, automatic discounts | bookings, orders, loyalty |
| `notifications` | Template-rendered multi-channel dispatch | event bus |
| `messaging` | Booking-scoped conversations | users, bookings |
| `analytics` | Aggregations, dashboards, export | read replicas / event store |
| `search` | Search abstraction (PG now, OpenSearch later) | providers, services, products |
| `recommendations` | Deterministic + (later) ML ranking | search, ratings, events |
| `ai` | `AIProvider` abstraction, moderation, embeddings | events, providers, admin |
| `fraud` | Rules + anomaly scoring + human review | events, payments, reviews |
| `admin` | Back-office controllers & config | most modules |
| `audit` | Append-only AuditLog + access helper | all modules |

### 3.3 Communication rules

* **Synchronous (in-process service call):** parent→child domain ops
  (e.g. `bookings` calls `availability.reserveSlot`, `payments` calls
  `commissions.calculate`). These run inside one DB transaction where data
  consistency requires it.
* **Asynchronous (EventBus → BullMQ):** side-effects that must not block the
  request or that fan out (e.g. `BOOKING_CONFIRMED` → notifications + loyalty +
  analytics + recommendations). The EventBus is the integration backbone that
  later powers AI and analytics without code changes in emitters.
* Each module **owns its tables**; no module reads another module's tables
  directly except through that module's exported application service or a
  read-model.

---

## 4. User / Role Architecture

### 4.1 User model (capability-based)

A `User` is never permanently "a customer" or "a provider". Capabilities are
granted by linked profiles + roles:

```
User (id, email, phone, passwordHash, status)
 ├── CustomerProfile (one-to-one, optional)
 └── ProviderProfile (one-to-one, optional)
```

A user may have both profiles (e.g. a makeup artist who also books massages).

### 4.2 Roles & permissions

RBAC with a `roles` ↔ `permissions` join. Justified roles:

| Role | Justification | Typical grants |
|------|---------------|----------------|
| `USER` | Authenticated base identity | manage own profile, view catalogs |
| `CUSTOMER` | Granted when CustomerProfile exists | book, pay, review, earn loyalty |
| `PROVIDER` | Granted when ProviderProfile exists | manage services/availability/earnings |
| `SUPPORT` | Customer/provider assistance, no financial authority | view, message, escalate disputes |
| `ADMIN` | Day-to-day operations & config | verify providers, manage catalog, disputes |
| `SUPER_ADMIN` | Platform configuration & irreversibles | commission rules, AI config, audit access |

Permissions are fine-grained (e.g. `booking:refund`, `provider:verify`,
`payout:initiate`). Guards check `Permission` not raw role strings, so the
role→permission mapping stays configurable. `SUPPORT` exists to separate
operational help from administrative power (least privilege).

---

## 5. Database Design (summary)

Full schema and rationale are in `DATABASE.md`. Key principles:

* **UUID v7** primary keys (time-sortable, distributed-safe).
* **Money as `bigint` minor units** (e.g. KES cents) — never floats.
* **Soft-delete** (`deletedAt`) on customer/provider-facing entities.
* **Snapshots** of financial figures persisted at transaction time.
* **Immutable financial ledger** tables (payments, earnings, payouts, loyalty
  transactions, audit log).

Tables are grouped logically and mapped to modules. The ERD is in
`DATABASE.md`.

---

## 6. Financial Data Model (summary)

Customer payment → `Payment` → `Commission` (snapshot) → `ProviderEarning`
(immutable) → `Payout`. All percentages and amounts are frozen onto the
transaction row at the moment of the event, so future commission-rule changes
never retroactively alter history. See `PAYMENTS.md` and `DATABASE.md`.

---

## 7. State Machines (summary)

* **Booking** states: `PENDING → AWAITING_PAYMENT → PAID → CONFIRMED →
  PROVIDER_ACCEPTED → IN_PROGRESS → COMPLETED` plus terminal/exception states
  (`CANCELLED`, `NO_SHOW`, `DISPUTED`, `REFUNDED`, `EXPIRED`,
  `PROVIDER_REJECTED`). Transitions are guarded by role + conditions + side
  effects, all logged. See `PAYMENTS.md`.
* **Payment** states are **separate**: `INITIATED → PENDING → SUCCESSFUL →
  (FAILED | CANCELLED | REFUNDED | PARTIALLY_REFUNDED)`. Booking state follows
  payment via events, never a single shared status field.
* **Payout** states: `PENDING → PROCESSING → SUCCESSFUL | FAILED → REVERSED`.

---

## 8. Provider Ranking (summary)

Configurable **Provider Quality Score** computed from normalized signals
(rating, completed jobs, repeat rate, cancellation, response, on-time,
verification/profile). Bayesian/confidence-adjusted to prevent 5 reviews
beating 1,000 jobs. Weights are admin-configurable and stored as config, not
hardcoded. See `AI.md` for evolution toward AI-assisted ranking.

---

## 9. Event Architecture (summary)

Domain events (`USER_REGISTERED`, `BOOKING_CONFIRMED`, `PAYMENT_SUCCESSFUL`,
`REVIEW_CREATED`, `ORDER_COMPLETED`, `POINTS_EARNED`, `PAYOUT_COMPLETED`, …)
are emitted by owning modules and consumed asynchronously by
notifications, loyalty, analytics, recommendations, fraud, and AI. This is the
data foundation for all future intelligence. Full map in `DATABASE.md` /
`AI.md`.

---

## 10. AI Readiness (summary)

A dedicated `ai` module exposes `AIProvider` (swap OpenAI/Anthropic/local),
`ModerationService`, `EmbeddingService`, `RecommendationService`. AI never
receives raw PII, never executes irreversible financial actions without
deterministic authorization, and is logged. Near-term use = deterministic rules
+ structured signals; ML only after sufficient data. See `AI.md`.

---

## 11. Security Architecture (summary)

Secure auth (Argon2/bcrypt + JWT with refresh rotation), RBAC/ABAC guards,
webhook signature verification + idempotency, file-upload validation, PII
minimization, secrets via env/secret manager, audit logging, rate limiting.
Never expose: password hashes, payment credentials, verification documents,
internal AI prompts, private customer data. Full detail in `SECURITY.md`.

---

## 12. Deployment Architecture (MVP)

* **Frontend:** Next.js on a Node host / Vercel-style platform behind CDN.
* **Backend:** Single NestJS service (containerized) behind API gateway/ALB.
* **Database:** Managed PostgreSQL (e.g. Supabase/RDS/Neon).
* **Redis:** Managed Redis for BullMQ + cache.
* **Object storage:** S3-compatible bucket (private + public CDN for images).
* **Workers:** BullMQ consumers in the same deploy (separate process/replicas
  later).
* **Observability:** Structured logs (pino), error tracking (Sentry), job
  monitoring.
* **CI/CD:** GitHub Actions → build → test → container image → deploy.

See `DEPLOYMENT.md`.

---

## 13. Risk Register (summary)

Full register with Impact/Likelihood/Mitigation in `SECURITY.md` and below.

| Risk | Impact | Likelihood | Mitigation (summary) |
|------|--------|------------|----------------------|
| Payment regulation / money movement | High | Med | Use licensed PSP; never hold funds unnecessarily; clear ledger. |
| Double payments / duplicate webhooks | High | Med | Idempotency keys; webhook dedup table; verify server-side. |
| Fake reviews / manipulation | High | High | Verified-only reviews; anomaly + fraud module; moderation. |
| Provider verification fraud | High | Med | Multi-level KYC; document expiry; admin review. |
| AI hallucination / abuse | Med | High | Deterministic guards; human-in-loop; output validation; audit. |
| Booking conflicts | High | Med | Transactional slot reservation; availability engine. |
| Provider payout failures | High | Med | Retry + alerting; manual fallback; reconciliation. |
| Data privacy | High | Med | PII minimization; encryption; access controls; audit. |
| Marketplace liquidity | High | High | Seed supply/demand; referral + social attribution. |
| Scalability | Med | Med | Indexes, caching, pagination, async jobs, stateless API. |

---

## 14. Recommended Implementation Roadmap

**PHASE 1 — Project Foundation**
1. Monorepo scaffold (Next.js + NestJS + Prisma + Docker Compose).
2. CI/CD, env config, secrets, lint/format, base logging.
3. `auth` + `users` + RBAC (roles/permissions) with JWT + refresh rotation.
4. Prisma schema v1 (users, roles, permissions, profiles, audit).
5. Shared `Money` utility + Zod schema contracts.

**PHASE 2 — Catalog & Discovery**
6. `categories`, `services`, `providers`, `verification`, `availability`.
7. `search` abstraction (PostgreSQL FTS + filters).
8. Provider mini-store pages (SEO/OpenGraph).

**PHASE 3 — Booking & Payments**
9. `bookings` state machine + availability conflict engine.
10. `payments` with `PaymentProvider` adapter (M-Pesa first) + webhook
    idempotency.
11. `commissions` + `earnings` + `payouts` (immutable ledger).

**PHASE 4 — Commerce & Engagement**
12. `products`, `inventory`, `orders`, `cart`.
13. `reviews`, `ratings`, `loyalty`, `referrals`, `promotions`.
14. `notifications`, `messaging`.

**PHASE 5 — Intelligence & Ops**
15. `analytics` dashboards, `fraud`, `recommendations`.
16. `ai` module (assistant, moderation, review analysis, admin copilot).
17. Ranking v1 (deterministic), then AI-assisted evolution.

**PHASE 6 — Hardening**
18. Pen-test, load-test, payment reconciliation, observability, SLA tuning.

---

## 15. Open Questions for Stakeholders

1. **PSP strategy:** Will SERVANA hold/sweep funds (requires licensing) or act
   as an agent passing through to providers via the PSP? This drives payout
   design.
2. **Geographic scope:** Kenya-only at launch (KES, M-Pesa) or multi-currency?
3. **Hosting region:** Data residency requirements for PII?
4. **Admin UI:** Separate Next.js app or route group under same app?

These do not block Phase 1 but should be answered before Phase 3 (payments).
