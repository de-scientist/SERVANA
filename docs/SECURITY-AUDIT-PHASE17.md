# SECURITY AUDIT REPORT — Phase 17

Date: 2026-09-24. Scope: full review of authentication, authorization,
endpoints, database access, payment webhooks, file uploads, admin functions,
provider verification, AI endpoints, secrets, logs, CORS, headers, rate
limits, sessions, and PII exposure. Proofs:
`apps/api/src/common/security/security.spec.ts` (19 negative tests).

Verdict: **no critical vulnerabilities remain open.** Three residual
medium/low items are documented below with mitigations planned.

---

## 1. Findings fixed in this phase

| # | Finding | Severity | Mitigation |
|---|---------|----------|------------|
| 1 | 500 responses echoed raw error text (Prisma query fragments, paths) to clients via `AllExceptionsFilter` | **High** | Filter now returns a generic `INTERNAL_ERROR`; details go to server logs only. Hand-rolled 4xx (`err.status`) preserved. |
| 2 | No security headers (no helmet; `X-Powered-By` exposed) | Medium | Added `helmet()` in `main.ts`. |
| 3 | Production could boot with `change_me_*` JWT secrets | **High** | `assertProductionSecrets()` refuses production boot with weak/missing secrets; also rejects CORS `*` in production. |
| 4 | Uploads buffered unboundedly (no multer limits); missing file threw raw 500; mimetype-only check (spoofable) | **High** | `FileInterceptor` limits (10 MB, 1 file) + `fileFilter`; missing file → 400; magic-byte sniffing (`sniffMatches`) in service. |
| 5 | Webhook accepted unsigned callbacks even with a secret configured, plus a `test-signature` backdoor | **High** | Configured secret must match, always. Unsigned accepted only when no secret is configured (local dev). |
| 6 | Rate-limit env names dead (`.env` documents `RATE_LIMIT_MAX`/`WINDOW_MS`, code read different names) | Medium | Guard honors documented names with legacy fallbacks. |
| 7 | Public provider profile leaked exact `lat`/`lng`, street `address` JSON and `businessPhone` | **High (safety)** | Trimmed to city-level; contact happens in-app via messaging. Web types updated. |

## 2. Areas audited — no issue found

* **Authentication**: bcrypt hashing, short-lived JWT (15 min), refresh rotation with revocation, password-gated email change, session revocation list, change-password revokes all sessions. Auth endpoints carry targeted `@Throttle` overrides (register/login 5–10/min).
* **Authorization**: JWT + RBAC guards on every mutating route; object-level ownership enforced in services (bookings, orders, carts, payouts, reviews, notifications, messages, provider resources). Negative tests prove cross-user/provider access fails.
* **Payment integrity**: amounts recomputed server-side; webhook amount/currency mismatch → FAILED; initiation only creates PENDING; SUCCESS exclusively via verified webhook. Negative tests prove forgery and alteration fail.
* **Commissions**: standard rule immutable in code; all rule management behind `SUPER_ADMIN`.
* **Loyalty**: no client mint path — points enter only via server-side `earn()` from rule values; redemption balance-guarded and transactional.
* **Reviews**: completed+paid+own+unique enforced; duplicate dimensions rejected; provider responses ownership-checked.
* **Verification documents**: storage keys never leave the server; owner view is self-scoped; public profile carries no documents.
* **Payout methods**: secrets/PANs rejected at the boundary; masked on every read.
* **Secrets**: `.env` files git-ignored; no hard-coded keys in `src`; no unsafe SQL (`$queryRaw` is a static `SELECT 1`); no `eval`.
* **Sessions**: refresh hashed, rotated on use, revocable per-session and globally; suspended users keep at most a 15-minute token window (accepted residual).
* **CORS**: explicit allowlist from env, credentials on, wildcard refused in production.
* **AI endpoints**: authenticated + role-gated; injection screening, PII minimization, rate + monthly cost caps, human-confirmation gate for sensitive actions; review-insights exposes only approved-review aggregates.
* **Logs**: `passwordHash` never serialized (mapped profiles); audit entries carry IDs, not secrets.

## 3. The 9 guarantees (all proven by failing-as-designed tests)

1. Users cannot access other users' bookings/orders.
2. Providers cannot modify another provider's services.
3. Payment amounts cannot be altered (webhook mismatch → FAILED).
4. Commissions cannot be modified (standard rule immutable; routes `SUPER_ADMIN`).
5. Payment success cannot be forged (initiation is PENDING-only).
6. Users cannot award themselves loyalty points (rule-sourced, idempotent, no mint route).
7. Reviews cannot be manipulated (eligibility + uniqueness + dimension guards).
8. Verification documents are never publicly accessible.
9. Non-admins cannot invoke admin APIs (guard-tested for every admin surface pattern).

## 4. Residual risks (accepted, tracked)

1. **Mimetype sniffing is allowlist-based, not AV scanning** (Medium). Malware
   scanning in the object pipeline is future work; uploads are size-capped,
   type-checked twice, and served as static content (never executed).
2. **PII at rest is not field-encrypted** (Medium). Mitigated by minimization
   (public surfaces trimmed), per-row ownership checks, and audit logging.
   Field-level encryption for phone/email is planned before handling
   production PII at scale.
3. **Single-instance rate limiter** (Low). Correct per instance; a Redis-backed
   limiter is required for multi-node deployments (noted in code).
4. **No MFA / account lockout yet** (Medium). Brute force is throttled;
   MFA (TOTP) and progressive lockout are planned (SECURITY.md §1.1).
5. **Suspended-user token window ≤15 min** (Low). Accepted; refresh rotation
   prevents renewal after suspension takes effect server-side on next refresh.

## 5. How to re-verify

```bash
npm test --workspace apps/api      # includes security.spec.ts (19 tests)
npm run typecheck --workspace apps/api
npm run lint --workspace apps/api
```

STOP condition met: no critical vulnerabilities remain unresolved.
