# SECURITY.md — Security Architecture

> Phase 0 blueprint. Defines security requirements and the sensitive-data
> boundary. Implementation details land in Phase 1 (auth) and Phase 3 (payments).

---

## 1. Security Requirements by Area

### 1.1 Authentication
* Password hashing with **Argon2id** (or bcrypt fallback); never plaintext/MD5.
* JWT access (short-lived, ~15 min) + refresh token with **rotation** and
  revocation list. Refresh stored hashed; rotation issues new + invalidates old.
* Optional MFA (TOTP/WebAuthn) for providers/admin.
* Account lockout / progressive delay after repeated failures.
* Session/`RefreshToken` table supports remote logout.

### 1.2 Authorization (RBAC/ABAC)
* Guards check **`Permission`** keys (e.g. `booking:refund`,
  `payout:initiate`, `provider:verify`), not raw roles.
* `SUPPORT` separated from `ADMIN`/`SUPER_ADMIN` (least privilege).
* Object-level ownership checks (`own` provider/customer resources) enforced in
  services, not just controllers.
* ABAC for context rules (e.g. refund only within window, payout only verified
  providers).

### 1.3 Payment webhooks
* **Signature verification** with provider secret on every `/payments/webhook/*`.
* **Idempotency:** `providerRef` unique + dedup table; safe to replay.
* Reject requests with missing/invalid signatures (401/429).
* Never trust `?status=success` query params or frontend claims.

### 1.4 Provider verification
* Documents stored in **private** S3 bucket; URLs are short-lived presigned.
* Admin access gated by `provider:verify`; access logged.
* Documents have expiry; re-verification workflow.
* KYC data encrypted at rest; never returned to client APIs.

### 1.5 File uploads
* Validate MIME type + size + magic bytes; strip metadata (EXIF) from images.
* Store outside web root; serve via CDN/presigned URLs.
* Scan for malware where feasible (AV in object pipeline).
* Rate-limit uploads per user.

### 1.6 Admin operations
* All admin mutations logged to `AuditLog` (who/what/before/after/ip).
* Sensitive admin actions (commission change, payout, refund, suspension)
  require permission + optional second-factor.
* Admin UI isolated; CSRF protection (SameSite + double-submit token).

### 1.7 PII
* Encrypt PII at rest (DB-level + field-level for phone/email where needed).
* Minimize fields; data-minimization in analytics/AI (see AI.md §5).
* Right-to-erasure: soft-delete + cascading anonymization of events.
* No PII in logs; redaction interceptor on structured logs.

### 1.8 AI prompts
* System prompts stored in `PromptRegistry`; never expose to clients.
* User input treated as data (injection isolation).
* PII filter before any external model call.
* AI calls audited.

### 1.9 API access
* HTTPS only (HSTS). CORS allow-list (web + admin origins).
* Rate limiting per route/role (Redis token bucket).
* Input validation (Zod/class-validator) on every DTO; never trust client.
* Anti-automation: CAPTCHA on register/login after thresholds.

### 1.10 Rate limiting & abuse
* Per-IP and per-user limits; stricter on auth/payment/initiation.
* BullMQ throttling for outbound notifications/SMS.

### 1.11 Audit logging
* `AuditLog` append-only for: commission changes, verification, payouts,
  refunds, suspensions, review removals, settings changes, AI actions.

---

## 2. Sensitive Data — Never Exposed Publicly

| Data | Exposure rule |
|------|---------------|
| Password hashes | Never; not in any API/response/log. |
| Payment credentials / PSP secrets | Server-only; env/secret manager; never to client. |
| Verification documents | Private bucket; presigned admin-only. |
| Internal AI prompts / config | Server-only. |
| Private customer info (email/phone/address) | Owner + authorized roles only. |
| Internal admin/financial aggregates | Admin roles only. |
| Webhook signatures / signing keys | Server-only. |
| Refresh tokens | Hashed; never returned. |

---

## 3. Threat Model (selected)

| Threat | Control |
|--------|---------|
| Stolen JWT | Short TTL + refresh rotation + revocation. |
| Webhook replay | Signature + idempotency + dedup. |
| IDOR on bookings/orders | Ownership guard in service layer. |
| Mass assignment | DTO whitelist (Zod). |
| SQL injection | Prisma parameterized queries; no raw SQL. |
| XSS | React escaping + CSP headers + sanitize user text. |
| CSRF | SameSite cookies + tokens on state-changing admin calls. |
| PII leak in logs | Redaction interceptor. |
| Prompt injection | Instruction/data isolation + output schema validation. |
| Brute force | Lockout + rate limit + CAPTCHA. |

---

## 4. Infrastructure Security
* Secrets via env/secret manager (never committed; `.env.example` only).
* Network: API not directly exposed to DB; private subnets.
* TLS termination at LB; internal mTLS optional later.
* Dependency scanning + SCA in CI; Snyk/Dependabot.
* WAF / bot mitigation in front of public endpoints.

---

## 5. Compliance Posture (target)
* PCI/PSP scope reduction: do not store card/PIN; use PSP tokens.
* Data residency: confirm region (open question in ARCHITECTURE.md).
* Retention & erasure policy documented in Phase 1.
* Regular pen-test before GA (Phase 6).

---

## 6. Risk Register (expanded)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| Payment regulation / money movement | High | Med | Licensed PSP; no custodial holding beyond window; clear ledger. |
| Double payments / duplicate webhooks | High | Med | Idempotency + dedup + server verification. |
| Fake reviews / manipulation | High | High | Verified-only reviews; fraud module; moderation; Bayesian ranking. |
| Provider verification fraud | High | Med | Multi-level KYC; doc expiry; admin review; audit. |
| AI hallucination / abuse | Med | High | Deterministic guards; human-in-loop; output validation; audit. |
| Booking conflicts / double-book | High | Med | Transactional slot reservation + availability engine. |
| Provider payout failures | High | Med | Retry + alert + manual fallback + reconciliation. |
| Refund abuse | High | Med | Permission + window + audit + dispute linkage. |
| Data privacy breach | High | Med | Encryption + minimization + access control + audit. |
| Marketplace liquidity | High | High | Seed supply/demand; referral + social attribution. |
| Scalability / outages | Med | Med | Indexes, cache, pagination, async, stateless API, Redis. |
| Secret leakage | High | Low | Secret manager; no commits; rotation; CI scanning. |
