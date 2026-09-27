# INCIDENT_RESPONSE.md — Incident Response Playbook

> Phase 19 incident response. Follow these procedures for production incidents.

---

## 1. Incident Classification

| Severity | Definition                                 | Response Time | Escalation |
|----------|--------------------------------------------|---------------|------------|
| **P0**   | Production outage, critical data loss, money movement failure | < 15 minutes | On-call engineer → Tech Lead → CTO |
| **P1**   | Major degradation, payment webhooks failing, AI downtime | < 30 minutes | On-call engineer → Tech Lead |
| **P2**   | Minor degradation, non-critical feature broken | < 2 hours    | On-call engineer |
| **P3**   | Cosmetic, documentation, non-impactful     | < 24 hours    | Engineer via ticket |

**P0 Indicators:**
- ` /api/v1/health` returning non-200
- All payment/webhook processing stopped
- Database connectivity lost
- Redis connectivity lost
- Payout pipeline completely blocked
- Sentry error spike > 50/minute

**P1 Indicators:**
- Degraded performance (latency > 3s p99)
- Individual payment failures
- Redis latency degradation
- Job queue backing up
- AI provider errors

---

## 2. P0 Response Procedure

### Step 1: Triage (0–5 minutes)

1. **Confirm the incident** — check health endpoint (`/api/v1/health`, `/api/v1/health/ready`, `/api/v1/health/metrics`), monitoring dashboards
2. **Identify scope** — is this frontend, backend, database, Redis, or external service?
3. **Determine severity** — P0/P1/P2/P3 per classification above
4. **Declare the incident** — post to `#alerts` Slack with:
   - Incident title
   - Severity
   - Current status (`Investigating`)
   - Affected services
   - Estimate of impact

### Step 2: Investigate (5–30 minutes)

1. **Check logs** — application logs, Sentry, monitoring dashboards
2. **Check recent deployments** — was there a recent CI/CD deploy?
3. **Check external services** — database, Redis, AI providers, PSP (M-Pesa)
4. **Identify root cause** — trace through logs, metrics, traces

### Step 3: Resolve (30–60 minutes)

Based on root cause:

| Incident Type                      | Resolution Procedure                                                                                   |
|------------------------------------|--------------------------------------------------------------------------------------------------------|
| **Database connectivity lost**       | 1. Check DB container/instance status<br>2. Verify security group/NACL rules<br>3. Restart if needed<br>4. Restore from backup if data loss |
| **Redis connectivity lost**          | 1. Check Redis container/instance status<br>2. Verify persistence<br>3. Restart and rehydrate from RDB |
| **All payment webhooks failing**     | 1. Verify `MPESA_WEBHOOK_SECRET` is set<br>2. Check signature verification logic<br>3. Review webhook logs for rejected requests<br>4. Temporarily accept webhooks if critical (document) |
| **Payout pipeline blocked**          | 1. Check BullMQ queue for stuck jobs<br>2. Verify payout method credentials<br>3. Manually process stuck items<br>4. Review failed job reasons |
| **API returning 5xx**                | 1. Check recent deploy<br>1. Rollback if recent deploy correlated<br>2. Check database/migrations<br>3. Restart API container |
| **Sentry error spike**                 | 1. Filter new errors vs. pre-existing<br>2. Check for deployment artifacts<br>3. Rollback if correlated<br>4. Fix and redeploy |

### Step 4: Post-Incident (within 24 hours)

1. **Write post-mortem** — document:
   - What happened
   - Root cause
   - Timeline of events
   - What went well
   - What could be improved
2. **Assign action items** — with owners and deadlines
3. **Update monitoring/alerts** — if gaps detected
4. **Communicate to stakeholders** — via `#alerts` or email
5. **Close the incident** — mark as resolved in Slack

---

## 3. P1 Response Procedure

Same as P0 but with 30-minute response window. Focus on:
- Degraded performance investigation
- Individual failure isolation
- External service status checks
- Workarounds if full resolution takes longer

---

## 4. Specific Incident Types

### 4.1 Database Outage

**Symptoms:** `pg_isready` failing, app logs `DB connection error`, health endpoint 503.

**Immediate actions:**
1. Check managed PG provider status page
2. Verify connection string `DATABASE_URL`
3. Check if credentials rotated recently
4. Attempt restart of DB instance (if cloud) or container
5. If data loss suspected: **DO NOT** restart without backup verification
6. Restore from last known good backup (see `OPERATIONS.md` Backup section)

**Post-incident:** Review connection pool settings, network policies, credential management.

### 4.2 Redis Outage

**Symptoms:** `redis-cli ping` failing, BullMQ jobs stuck, rate limiter unavailable.

**Immediate actions:**
1. Check Redis container/instance status
2. Verify `REDIS_URL` environment variable
3. Check persistence — data may be lost depending on configuration
4. Restart Redis container/service
5. Re-enqueue failed jobs from BullMQ dashboard
6. Verify rate limits recover

**Post-incident:** Review Redis persistence configuration (RDB/AOF), failover setup.

### 4.3 Payment Webhook Failure

**Symptoms:** `webhook_invalid_sig` alerts, payments not processing, `MPESA_WEBHOOK_SECRET` warnings.

**Immediate actions:**
1. Verify `MPESA_WEBHOOK_SECRET` is set in production env
2. Check webhook signature verification logic
3. Review recent webhook receipts in logs
4. If secret rotated: rotate in PSP dashboard AND app; update dedup table if needed
5. If signature mismatch: check payload encoding, whitespace, key order
6. Temporarily disable signature verification only if critical (document and re-enable ASAP)

**Post-incident:** Review webhook handling, idempotency, signature rotation procedure.

### 4.4 Payout Failure

**Symptoms:** Failed payout jobs, `Payout` items stuck in `PENDING`, alert on `payout_failure_total`.

**Immediate actions:**
1. Check BullMQ queue for payout jobs — identify stuck/failed jobs
2. Review failed job error messages
3. Verify payout method credentials (M-Pesa STK push, bank details)
4. Check sender balance / limits
5. Manually retry failed jobs via BullMQ UI or API
6. If systemic: investigate provider API status, credential expiry

**Post-incident:** Review payout provider integration, retry logic, credential rotation.

### 4.5 AI Provider Outage

**Symptoms:** `ai_error_total` alerts, AI calls failing, fallback to stub provider.

**Immediate actions:**
1. Check AI provider status page (OpenAI/Anthropic status)
2. Verify API keys are valid and not expired
3. Switch to fallback provider if configured
4. Queue AI requests for retry when provider recovers
5. Investigate rate limit exhaustion

**Post-incident:** Review AI provider redundancy, key management, fallback logic.

### 4.6 Data Leakage in Logs

**Symptoms:** PII detected in logs, security review flag, audit finding.

**Immediate actions:**
1. Identify the log source — which component is logging PII
2. Enable `APP_ENV=production` to enforce redaction interceptor
3. Find and fix the logging statement — use structured logging with redaction
4. Rotate any exposed secrets (JWT, webhook secrets, API keys)
5. Review `SECURITY.md` redaction rules

**Post-incident:** Audit recent logs for PII exposure, update redaction patterns, add test coverage.

---

## 5. Communication Protocols

### Internal Channels

| Channel   | Purpose                              |
|-----------|--------------------------------------|
| `#alerts` | All production incidents and alerts  |
| `#ops`    | Day-to-day operations, deployments    |
| `#dev`    | Development discussions              |
| `#security` | Security-related issues              |

### Escalation Path

```
On-call Engineer → Tech Lead → CTO → CISO (if security-related)
```

### Stakeholder Communication

- **Customers** — only if payment/data incident; compose via legal/comms review
- **Team** — via `#alerts` with status updates every 30 minutes during P0
- **Executive** — only P0 incidents with business impact; CTO decides

---

## 6. Runbook Templates

### Database Restore Runbook

```text
1. Verify backup exists: gsutil cp gs://backups/servana/YYYYMMDD.sql.gz ./
2. Verify backup integrity: gzip -t backup_file.sql.gz
3. Create restore database: createdb servana_restoredb
4. Restore: zcat backup_file.sql.sql.gz | psql servana_restoredb
5. Run migrations: prisma migrate deploy --database URL_restored
6. Verify row counts: SELECT count(*) FROM User; SELECT count(*) FROM Payment;
7. If valid: promote to production or document findings
8. Cleanup: dropdb servana_restoredb
```

### Payout Retry Runbook

```text
1. BullMQ UI: identify failed payout jobs
2. For each failed job: review error type
3. If transient (network/timing): retry with automatic backoff
4. If permanent (invalid credentials): fix credentials, then retry
5. If insufficient funds: contact sender, document reason
6. Verify Payout items updated to AVAILABLE or PAID status
7. Notify affected providers if applicable
8. Update monitoring thresholds if needed
```

### AI Provider Failover Runbook

```text
1. Check primary provider status page
2. If unavailable: switch `AI_DEFAULT_PROVIDER` to fallback in env
3. Redeploy service with new provider env
4. Queue pending AI requests for retry
5. Monitor `ai_error_total` decreases
6. When primary recovers: switch back, redeploy
7. Document outage duration and impact
```