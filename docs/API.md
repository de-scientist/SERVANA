# API.md — REST API Map (v1)

> Phase 0 blueprint. Endpoints are grouped by domain under `/api/v1/`.
> Auth: `Bearer` JWT unless noted. Roles/permissions use RBAC (see
> ARCHITECTURE.md §4). Responses are enveloped: `{ data, error, meta }`.
> No endpoints are implemented in Phase 0 — this is the contract.

---

## 1. Conventions

* Base: `https://api.servana.<tld>/api/v1`
* Auth header: `Authorization: Bearer <accessToken>`
* Pagination: `?page&pageSize`, response `meta:{page,pageSize,total}`.
* Errors: `4xx/5xx` with `{ error:{ code, message, details? } }`.
* Money in request/response: **string of minor units** + `currency` to avoid
  JSON number precision loss (e.g. `"amountCents":"200000"`).
* DTOs validated with Zod on client and `class-validator`/Zod on server.

---

## 2. Endpoint Map

### Auth & Users
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/auth/register` | Register user | — | — |
| POST | `/auth/login` | Login | — | — |
| POST | `/auth/refresh` | Rotate refresh token | Refresh | — |
| POST | `/auth/logout` | Invalidate session | User | — |
| POST | `/auth/mfa/enable` | Enable MFA | User | — |
| GET | `/users/me` | Current profile | User | — |
| PATCH | `/users/me` | Update profile | User | — |
| GET | `/users/me/roles` | My roles/caps | User | — |

### Customers
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/customers/profile` | Create customer profile | User | — |
| GET | `/customers/me/favourites` | List favourites | Customer | — |
| POST | `/customers/me/favourites` | Add favourite | Customer | — |
| DELETE | `/customers/me/favourites/:id` | Remove | Customer | — |

### Providers
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/providers/profile` | Create provider profile | User | — |
| GET | `/providers/:slug` | Public mini-store | — | — |
| PATCH | `/providers/me` | Update own profile | Provider | — |
| GET | `/providers` | Search/list providers | — | — |
| POST | `/providers/me/documents` | Upload verification doc | Provider | — |
| GET | `/providers/me/earnings` | Earnings summary | Provider | — |
| GET | `/providers/me/payouts` | Payout history | Provider | — |

### Verification
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/providers/me/verification/submit` | Submit for verification | Provider | — |
| GET | `/admin/verifications` | Queue | Admin | `provider:verify` |
| POST | `/admin/verifications/:id/decide` | Approve/reject | Admin | `provider:verify` |

### Categories & Services
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| GET | `/categories` | List taxonomy | — | — |
| POST | `/admin/categories` | Create category | Admin | `category:manage` |
| GET | `/services` | List/search services | — | — |
| GET | `/services/:id` | Service detail | — | — |
| POST | `/providers/me/services` | Add provider service | Provider | — |
| PATCH | `/providers/me/services/:id` | Edit | Provider | own |
| DELETE | `/providers/me/services/:id` | Deactivate | Provider | own |

### Availability
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| GET | `/providers/:id/availability` | Rules+exceptions | — | — |
| POST | `/providers/me/availability/rules` | Set rule | Provider | own |
| POST | `/providers/me/availability/exceptions` | Add exception | Provider | own |
| GET | `/providers/:id/slots` | Computed free slots | — | — |

### Bookings
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/bookings` | Create booking | Customer | — |
| GET | `/bookings/:id` | Booking detail | Customer/Provider | own/`booking:read` |
| GET | `/customers/me/bookings` | My bookings | Customer | — |
| GET | `/providers/me/bookings` | Provider bookings | Provider | — |
| POST | `/bookings/:id/cancel` | Cancel | Customer/Admin | own/`booking:cancel` |
| POST | `/bookings/:id/accept` | Provider accept | Provider | own |
| POST | `/bookings/:id/start` | Mark in-progress | Provider | own |
| POST | `/bookings/:id/complete` | Mark complete | Provider | own |
| POST | `/bookings/:id/no-show` | Mark no-show | Provider | own |
| GET | `/bookings/:id/history` | Status history | own/Admin | — |

### Payments
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/payments/initiate` | Initiate payment | Customer | — |
| POST | `/payments/webhook/:provider` | PSP callback | — (signed) | — |
| GET | `/payments/:id` | Payment status | own/Admin | — |
| POST | `/payings/:id/refund` | Refund | Admin | `booking:refund` |

### Payouts
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/providers/me/payout-methods` | Add method | Provider | own |
| POST | `/admin/payouts/run` | Batch payout | Admin | `payout:initiate` |
| GET | `/admin/payouts` | Payout list | Admin | `payout:read` |

### Products & Orders
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| GET | `/products` | List/search | — | — |
| GET | `/products/:slug` | Detail | — | — |
| POST | `/admin/products` | Create | Admin | `product:manage` |
| POST | `/cart/items` | Add to cart | Customer | — |
| GET | `/cart` | View cart | Customer | — |
| POST | `/orders` | Checkout | Customer | — |
| GET | `/orders/:id` | Order detail | Customer/Admin | own/`order:read` |
| POST | `/orders/:id/cancel` | Cancel | Customer/Admin | own/`order:cancel` |

### Reviews & Ratings
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/reviews` | Create (post-completion) | Customer | — |
| GET | `/providers/:id/reviews` | List | — | — |
| POST | `/reviews/:id/respond` | Provider respond | Provider | own |
| POST | `/reviews/:id/report` | Report | Customer | — |
| POST | `/admin/reviews/:id/moderate` | Moderate | Admin | `review:moderate` |

### Loyalty / Referrals / Promotions
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| GET | `/loyalty/me` | Balance+ledger | Customer | — |
| POST | `/loyalty/redeem` | Redeem reward | Customer | — |
| GET | `/referrals/me` | My code+status | Customer | — |
| POST | `/promotions/validate` | Validate code | Customer | — |

### Notifications & Messaging
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| GET | `/notifications` | My inbox | User | — |
| POST | `/conversations` | Start (booking-scoped) | User | — |
| GET | `/conversations/:id/messages` | Messages | participant | — |
| POST | `/conversations/:id/messages` | Send | participant | — |

### Search & Recommendations
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| GET | `/search?q=&...` | Unified search | — | — |
| GET | `/recommendations/services` | For me | Customer | — |

### Analytics & Admin
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| GET | `/admin/analytics/marketplace` | Dashboards | Admin | `analytics:read` |
| GET | `/admin/analytics/financial` | Financial | Admin | `analytics:read` |
| GET | `/admin/audit` | Audit log | SuperAdmin | `audit:read` |
| GET | `/admin/fraud/alerts` | Fraud queue | Admin | `fraud:read` |

### AI (future; contract now)
| Method | Path | Purpose | Auth | Permission |
|--------|------|---------|------|------------|
| POST | `/ai/assistant` | Customer NL assistant | Customer | — |
| POST | `/ai/provider/marketing` | Generate copy | Provider | own |
| POST | `/admin/ai/copilot` | Admin Q&A | Admin | `ai:admin` |

---

## 3. Representative Request/Response Shapes

### POST `/bookings` (Customer)
Request:
```json
{
  "providerServiceId": "ps_01",
  "startsAt": "2026-09-10T14:00:00Z",
  "deliveryType": "AT_CUSTOMER_LOCATION",
  "address": { "lat": -1.29, "lng": 36.82, "note": "Apt 4B" },
  "attribution": { "utm_source": "instagram", "referralCode": "JANE10" }
}
```
Response `201`:
```json
{
  "data": {
    "id": "bk_01",
    "status": "AWAITING_PAYMENT",
    "priceCents": "200000",
    "currency": "KES",
    "payment": { "id": "pay_01", "status": "INITIATED", "provider": "mpesa" }
  }
}
```

### POST `/payments/webhook/mpesa` (public, signed)
```json
{
  "data": { "transactionId": "...", "status": "SUCCESS", "amount": 2000 },
  "signature": "sha256=..."
}
```
Response `200` (idempotent): `{ "data": { "processed": true } }`.

### GET `/providers/me/earnings` (Provider)
```json
{
  "data": {
    "grossCents": "480000",
    "commissionCents": "48000",
    "feeCents": "5000",
    "refundCents": "0",
    "pendingCents": "120000",
    "availableCents": "307000",
    "paidCents": "0",
    "currency": "KES"
  }
}
```

---

## 4. Versioning & Evolution

* All routes under `/api/v1`. Breaking changes → `/api/v2` with deprecation
  window. Internal module-to-module calls use services, not HTTP.
* OpenAPI spec generated from NestJS decorators in Phase 1; published at
  `/api/v1/docs`.
