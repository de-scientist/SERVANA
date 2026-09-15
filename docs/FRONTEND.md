# FRONTEND.md — Information Architecture, Search, Social Entry Points, NFR

> Phase 0 blueprint. Supplements ARCHITECTURE.md with UI structure and
> cross-cutting non-functional requirements.

---

## 1. Frontend Information Architecture

Single Next.js App Router application with three route groups (shared design
system, distinct layouts). Mobile-first; provider/customer pages are public +
SEO-friendly.

### 1.1 Customer
```
/                      Home (search, recommended, nearby, popular, offers, loyalty)
/explore               Category + filter browse
/services/[slug]       Service detail
/providers             Provider search/list
/providers/[slug]      Provider mini-store (SEO/OG)
/bookings              My bookings
/bookings/[id]         Booking detail + status
/cart                  Cart
/checkout              Checkout (payment)
/products              Product catalog
/products/[slug]      Product detail
/orders                My orders
/orders/[id]          Order detail
/rewards              Loyalty status + rewards
/profile              Profile + settings
/support              Help + disputes + conversations
```

### 1.2 Provider (authenticated)
```
/provider/dashboard        Today's bookings, pending, earnings, upcoming
/provider/profile           Profile + verification status
/provider/verification      KYC document submission
/provider/services          Manage services/pricing
/provider/availability      Hours/exceptions/slots
/provider/bookings          Manage bookings (accept/start/complete)
/provider/customers         Customer list/CRM
/provider/earnings          Earnings ledger
/provider/payouts           Payout history + methods
/provider/reviews           Reviews + AI summary
/provider/products          Mini-store products
/provider/analytics         Performance
/provider/ai               Marketing/insight tools
/provider/settings          Account/notification settings
```

### 1.3 Admin (authenticated, isolated layout)
```
/admin/dashboard
/admin/users  /admin/providers  /admin/verifications
/admin/services  /admin/categories
/admin/bookings  /admin/payments  /admin/commissions  /admin/payouts
/admin/products  /admin/orders  /admin/reviews
/admin/loyalty  /admin/promotions  /admin/disputes  /admin/fraud
/admin/analytics  /admin/ai  /admin/settings  /admin/audit
```

---

## 2. Search Architecture

**Now:** PostgreSQL full-text search (`to_tsvector`) + structured filters
(service, category, location, price, rating, availability, distance, delivery
type). `search` module exposes:

```ts
interface SearchService {
  searchProviders(q: SearchQuery): Promise<ProviderResult[]>;
  searchServices(q: SearchQuery): Promise<ServiceResult[]>;
  searchProducts(q: SearchQuery): Promise<ProductResult[]>;
}
```

* `SearchQuery` is structured (q, filters, geo, sort) so NL assistant can emit
  it directly.
* Distance via PostGIS (`earthdistance`/`<->` operator) once enabled; fallback
  haversine in app.
* Indexes on `tsvector` + common filter columns.

**Later:** swap implementation to OpenSearch/Elasticsearch behind the **same**
`SearchService` interface. Emitters (UI, recommendations, AI assistant) are
untouched. `SearchEvent` logged for ranking/analytics.

---

## 3. Social Media Entry Points

Traffic from Instagram / TikTok / Facebook / WhatsApp.

* **UTM tracking:** captured on landing via `Attribution` (utm_source,
  utm_medium, utm_campaign, utm_content) stored on session → booking/order.
* **Provider/Service share links:** `/providers/[slug]?ref=CODE&utm_source=ig`
  → `Attribution` ties conversion to provider + campaign.
* **Referral links:** `/?ref=CODE` issues `ReferralCode` cookie (TTL 30d).
* **OpenGraph:** dynamic `generateMetadata` for provider/service/product/category
  pages (title, description, image, OG type). Twitter/X cards too.
* **Campaign attribution:** `PromotionRedemption` + `Attribution` feed admin
  marketing analytics (source → bookings → revenue → conversion).
* **WhatsApp:** shared deep links with prefilled text via `wa.me` scheme.

---

## 4. Non-Functional Requirements

| Area | Target |
|------|--------|
| Performance | LCP < 2.5s on 4G; API p95 < 300ms; avoid N+1; DB indexes + pagination. |
| Availability | 99.9% for API (managed PaaS/DB); graceful degrade for recommendations. |
| Security | Per SECURITY.md; PCI/PSP scope reduction; pen-test before GA. |
| Scalability | Stateless API; horizontal replicas; Redis cache; async jobs; read replica later. |
| Observability | Structured logs, error tracking, latency/DB/job/webhook monitors. |
| Accessibility | WCAG 2.1 AA; semantic HTML; focus states; contrast tokens. |
| SEO | SSR/ISR, metadata, OG, sitemap, robots, structured data (JSON-LD). |
| Maintainability | Modular monolith, strict TS, lint/format, tests, docs. |
| Data integrity | FK constraints, transactions, immutability for financial/audit rows. |
| Financial integrity | Snapshot commissions; integer money; idempotent webhooks; reconciliation. |

---

## 5. Design System (summary)

Tailwind tokens + shadcn/ui base, customized into SERVANA identity: premium,
modern, trustworthy, beauty-aware, warm. Design tokens (color, type scale,
spacing, radius, shadow), responsive breakpoints, accessible contrast, subtle
depth (no heavy glassmorphism), minimal motion.
