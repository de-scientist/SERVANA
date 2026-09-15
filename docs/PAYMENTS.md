# PAYMENTS.md — Payment, Commission, Booking & Payout State Machines

> Phase 0 blueprint. Defines state machines, the immutable financial flow, and
> the commission/payout architecture. Business logic must use the
> `PaymentProvider` adapter, never a PSP SDK directly.

---

## 1. Money Handling Rules

1. All amounts stored as `BigInt` minor units (KES cents). Display conversion is
   a pure function `cents / 100`.
2. Arithmetic is integer-only. Split/round using banker's rounding with explicit
   rules; never `Float`.
3. Every financial table (`Payment`, `PaymentTransaction`, `Commission`,
   `ProviderEarning`, `Refund`) is **append-only**; corrections are new rows, not
   edits.
4. Historical commission % is frozen at transaction time (see §4). Current
   commission config changes never rewrite history.

---

## 2. Booking State Machine

### 2.1 States

```
PENDING → AWAITING_PAYMENT → PAID → CONFIRMED → PROVIDER_ACCEPTED
→ IN_PROGRESS → COMPLETED

Exception/terminal (from allowed states):
  PENDING/AWAITING_PAYMENT/PAID/CONFIRMED → CANCELLED
  AWAITING_PAYMENT (timeout)              → EXPIRED
  CONFIRMED/IN_PROGRESS                  → DISPUTED
  COMPLETED/PAID                         → REFUNDED
  CONFIRMED                              → PROVIDER_REJECTED
  IN_PROGRESS                            → NO_SHOW
```

**States kept (all justified):**
`PENDING` (created, not yet pay), `AWAITING_PAYMENT` (intent, pay link sent),
`PAID` (funds captured), `CONFIRMED` (provider/systems confirmed slot),
`PROVIDER_ACCEPTED` (manual accept where model requires),
`PROVIDER_REJECTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`,
`DISPUTED`, `REFUNDED`, `EXPIRED`.

> `PROVIDER_ACCEPTED`/`PROVIDER_REJECTED` only apply to providers using manual
> acceptance; for instant-book services these are skipped (transition
> `PAID → CONFIRMED` directly). The state machine is data-driven per
> `ProviderService.bookingMode`.

### 2.2 Transition table

| From | To | Actor | Conditions | Side effects | Event |
|------|----|-------|-----------|--------------|-------|
| (create) | PENDING | Customer | valid slot free | reserve slot (soft) | BOOKING_CREATED |
| PENDING | AWAITING_PAYMENT | System/Customer | price computed | create `Payment` (INITIATED) | — |
| AWAITING_PAYMENT | PAID | Webhook (PSP) | `Payment` → SUCCESSFUL | `Commission`, `ProviderEarning` created (PENDING) | PAYMENT_SUCCESSFUL |
| AWAITING_PAYMENT | EXPIRED | System (TTL) | no payment in window | release slot | BOOKING_EXPIRED |
| AWAITING_PAYMENT | CANCELLED | Customer | before capture | void `Payment` | BOOKING_CANCELLED |
| PAID | CONFIRMED | System/Provider | auto-confirm or provider accept | confirm slot | BOOKING_CONFIRMED |
| PAID | PROVIDER_REJECTED | Provider | within SLA | release slot, refund flow | BOOKING_REJECTED |
| CONFIRMED | PROVIDER_ACCEPTED | Provider | manual model | notify | — |
| CONFIRMED/PROVIDER_ACCEPTED | IN_PROGRESS | Provider | at start time | — | SERVICE_STARTED |
| IN_PROGRESS | COMPLETED | Provider | service done | earn→AVAILABLE, review unlock | SERVICE_COMPLETED |
| IN_PROGRESS | NO_SHOW | Provider | customer absent | partial/late fee policy | NO_SHOW |
| COMPLETED | REFUNDED | Admin/System | dispute win / refund | `Refund` + `ProviderEarning` adjust | REFUND_ISSUED |
| CONFIRMED/IN_PROGRESS | DISPUTED | Customer/Provider | dispute opened | freeze payout | DISPUTE_OPENED |
| (most) | CANCELLED | Admin | justified | refund if captured | BOOKING_CANCELLED |

### 2.3 Guards

* **No double booking:** slot reservation is a transactional check on
  `AvailabilityRule` + existing `Booking` overlapping `[startsAt, endsAt]` inside
  one DB transaction; conflict → reject with `409`.
* **Idempotent transitions:** `BookingStatusHistory` + a `transitionLock`
  prevent replaying the same transition.
* **Auth:** only the named `Actor` (and `ADMIN`/`SUPER_ADMIN` for overrides) may
  trigger a transition; enforced by NestJS guards bound to `Permission`.

---

## 3. Payment State Machine (separate from booking)

```
INITIATED → PENDING → SUCCESSFUL → (REFUNDED | PARTIALLY_REFUNDED)
                │
                └──→ FAILED
INITIATED → CANCELLED
```

| From | To | Trigger | Notes |
|------|----|---------|-------|
| (create) | INITIATED | booking/order created | idempotency key generated |
| INITIATED | PENDING | sent to PSP | provider `PaymentProvider.initiate()` |
| PENDING | SUCCESSFUL | verified webhook | **server-verified**, never frontend claim |
| PENDING | FAILED | webhook/timeout | release booking slot |
| PENDING | CANCELLED | user/timeout | release slot |
| SUCCESSFUL | REFUNDED | admin/dispute | full; creates `Refund` rows |
| SUCCESSFUL | PARTIALLY_REFUNDED | admin/dispute | partial |

**Booking coupling:** Payment state drives booking only through events:
`SUCCESSFUL → BOOKING PAID`; `FAILED/CANCELLED → BOOKING EXPIRED/CANCELLED`.
The two never share a single status field.

### 3.1 Webhook safety

* Verify signature with provider secret.
* Idempotency: `Payment.idempotencyKey` + `providerRef` unique → duplicate
  webhooks are no-ops.
* Store raw webhook payload in `PaymentTransaction`/audit for reconciliation.
* Reconciliation job compares PSP reports to local `Payment` rows daily.

---

## 4. Commission Architecture

### 4.1 Engine

`commissions` module resolves the applicable `CommissionRule` at **payment
capture time** using (priority order):
`provider:<id>` → `tier:<tier>` → `category:<cat>` → `standard`.
Result is computed and **snapshotted**:

```
Commission {
  paymentId
  ruleSnapshot   // JSON of matched rule(s)
  baseCents      // gross - discount
  rateBasisPoints
  commissionCents = baseCents * rateBasisPoints / 10000
}
```

`CommissionRule.value` for PERCENTAGE is stored in **basis points** (e.g. 10% =
1000 bp) to stay integer.

### 4.2 Immutability

Once `Commission` row exists it is never updated. Changing `CommissionRule`
today affects only *future* payments. Financial reports read `Commission`
snapshots → historical accuracy guaranteed.

### 4.3 Example

```
Service price:    200000 cents (KES 2,000)
Discount:         0
Base:             200000
Rate:             1000 bp (10%)
Commission:       20000 cents
ProviderEarning.net = 200000 - 20000 - feeCents
```

---

## 5. Provider Payout Model

### 5.1 Flow

```
Booking (COMPLETED)
  → Payment (SUCCESSFUL)         [captures funds]
  → Commission (snapshot)        [platform take]
  → ProviderEarning (PENDING)    [immutable accrual]
       → after hold/clear period → AVAILABLE
  → Payout (batched/manual)      [moves money to provider]
       → PayoutItem links earnings
  → ProviderEarning → PAID
```

### 5.2 Provider dashboard figures (derived, not stored as truth)

| Display | Source |
|---------|--------|
| Gross earnings | Σ `ProviderEarning.grossCents` |
| Commission | Σ `commissionCents` |
| Payment fees | Σ `feeCents` |
| Refunds | Σ `refundCents` |
| Adjustments | Σ `adjustmentCents` |
| Pending earnings | Σ where `status = PENDING` |
| Available earnings | Σ where `status = AVAILABLE` |
| Paid earnings | Σ where `status = PAID` (via `PayoutItem`) |

### 5.3 Payout states

`PENDING → PROCESSING → SUCCESSFUL | FAILED → REVERSED`.
Failed payout returns linked earnings to `AVAILABLE` and retries on schedule.
`Payout.reference` is unique; idempotent with PSP.

### 5.4 Immutable boundary

`ProviderEarning` values (`gross/commission/fee/net`) are frozen at creation.
Only `status` transitions (PENDING→AVAILABLE→PAID, or REVERSED on dispute).
Refunds/adjustments create **new** `ProviderEarning` correction rows or
`Refund`/`Adjustment` `PaymentTransaction` rows — never mutate the original.

---

## 6. Product Order Payment (reuse)

`Order` payments reuse the same `PaymentProvider` + `Payment` tables
(`Payment.orderId`). Commission may not apply to products unless configured;
product margins are captured in `OrderItem.unitCents` vs cost (cost optional in
v1). Product refunds follow the same `REFUNDED`/`PARTIALLY_REFUNDED` paths and
adjust `Inventory` (restock reserved).

---

## 7. Risk Controls (payment-specific)

* **Double payment:** idempotency key per booking/order + webhook dedup.
* **Duplicate webhook:** `providerRef` unique constraint + idempotent handler.
* **Money movement licensing:** route through licensed PSP; SERVANA does not
  hold customer funds beyond capture-to-payout window (confirm legal posture in
  Phase 3 — see open questions in ARCHITECTURE.md).
* **Refund integrity:** refunds require `booking:refund` permission; every
  refund logged to `AuditLog` + creates `Refund` + `PaymentTransaction`.
* **Reconciliation:** nightly job matches PSP settlement vs local ledger;
  mismatch → `FraudAlert`/ops ticket.
