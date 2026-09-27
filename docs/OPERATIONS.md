# OPERATIONS.md — Production Operations Guide

> Phase 19 production operations. Runbook for day-to-day operations, maintenance, and troubleshooting.

---

## 1. Environment Variables

| File             | Description                              | Example                          |
|------------------|------------------------------------------|----------------------------------|
| `.env.local`     | Local development (Docker Compose)       | `APP_ENV=development`            |
| `.env.staging`   | Staging environment                      | `APP_ENV=staging`                |
| `.env.production`| Production environment                   | `APP_ENV=production`             |

**Never commit `.env*` files.** They are gitignored. Provide `.env.example` only.

**Critical — never use production credentials locally:**
- `DATABASE_URL` — use local Docker PG or staging DB
- `REDIS_URL` — use local Redis or staging instance
- `MPESA_WEBHOOK_SECRET` — never set to prod value locally
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — use dev secrets only
- `AI_PROVIDER_OPENAI_KEY`, `AI_PROVIDER_ANTHROPIC_KEY` — use staging/test keys

Validate environment on startup:
```bash
# Check we're not using prod creds locally
if [ "$APP_ENV" = "production" ]; then
  echo "WARNING: Running in production mode — verify this is intentional"
fi
```

## 2. PostgreSQL Operations

### Daily Operations

| Task                      | Frequency | Command                                                                                     |
|---------------------------|-----------|---------------------------------------------------------------------------------------------|
| Check DB connectivity     | Daily     | `pg_isready -h <host> -U servana -d servana`                                               |
| Monitor connection pool   | Daily     | `psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"`                         |
| Check for long-running queries | Daily | `psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '5 minutes';"` |
| Verify backups            | Daily     | See Backup section below                                                                    |

### Backups

| Task          | Frequency | Command/Procedure                                                                     |
|---------------|-----------|---------------------------------------------------------------------------------------|
| Take backup   | Automaily | Managed PG provider (PITR + daily snapshots)                                          |
| Verify backup | Weekly    | `pg_dump "$DATABASE_URL" | gzip > backup_$(date +%F).sql.gz && gzip -t backup_$(date +%F).sql.gz` |
| Restore backup| On demand | `zcat backup_2026-09-20.sql.gz | psql "$DATABASE_URL"`                                    |

**Restore procedure:**
1. Create a new database: `createdb servana_restore`
2. Restore: `zcat backup_file.sql | psql -d servana_restore`
3. Run `prisma migrate deploy` to ensure schema consistency
4. Verify row counts on critical tables (`User`, `Payment`, `Booking`)
5. If valid, switch connection strings or dump/re-import as needed

### Migration Strategy

- **Development:** `prisma migrate dev --create-only` for new features
- **Staging:** `prisma migrate deploy` after PR merge to `staging`
- **Production:** `prisma migrate deploy` only after:
  1. PR merged to `main` with `promote-to-prod` tag
  2. Migration validation in CI/CD (see `DEPLOYMENT.md`)
  3. Backup taken before deployment
  4. Rollback plan prepared (see below)

**Rollback procedure:**
1. Identify the last successful migration version: `prisma migrate show`
2. Rollback: `prisma migrate reset --target <version>` or manual reversion
3. Verify data integrity on AuditLog and financial tables
4. Communicate rollback to team via #ops channel

### Monitoring

- `pg_stat_activity` — active queries, connection count, wait types
- `pg_stat_replication` — replica lag (if read replicas configured)
- `pg_backups` — backup age, success/failure status
- Set up alerts on:
  - Connection pool exhaustion (>80% used)
  - Long-running queries (>5 minutes)
  - Backup failures
  - Replication lag (>30 seconds)

## 3. Redis Operations

### Daily Operations

| Task                      | Frequency | Command                                                                     |
|---------------------------|-----------|-----------------------------------------------------------------------------|
| Check Redis connectivity    | Daily     | `redis-cli -u "$REDIS_URL" ping`                                            |
| Monitor memory usage      | Daily     | `redis-cli -u "$REDIS_URL" info memory | grep used_memory_human`          |
| Check queue depth         | Daily     | `redis-cli -u "$REDIS_URL" LLEN bullana:bullmq:completed                  |
| Verify persistence        | Daily     | `redis-cli -u "$REDIS_URL" info persistence | grep rdb_last_save`           |

### BullMQ Specific

| Metric                          | Alert threshold       |
|---------------------------------|-----------------------|
| Queue depth (per queue)         | > 1000 messages       |
| Failed jobs                       | > 5 per hour          |
| Job processing time p99          | > 30 seconds          |
| Worker disconnects                | > 2 in 5 minutes      |

### Monitoring

- Redis latency p99 — alert > 100ms
- Memory usage — alert > 80% of allocated
- Key space events for monitoring key deletions
- BullMQ dashboard at `/dashboard` (if enabled)

## 4. Background Workers (BullMQ)

### Process Management

| Task                      | Command/Procedure                                    |
|---------------------------|-------------------------------------------------------|
| Start workers             | `NODE_ENV=production pnpm nx run api:start:prod -- --bullmq` |
| Check worker status       | Monitor BullMQ dashboard or `failed` job count         |
| Restart a worker          | `pm2 restart servana-api` or container restart          |
| View failed jobs          | `redis-cli ...` or BullMQ UI                          |

### Failed Job Handling

1. **Identify** failed job in BullMQ UI or logs
2. **Determine cause** — exception type, retry count exceeded
3. **Re-enqueue** if transient: `BullMQ` automatic retry on transient errors
4. **Manual intervention** if permanent error — investigate and fix, then re-enqueue
5. **Alert** on > 5 failures/hour via monitoring

### Concurrency Configuration

- Set `BULLMQ_CONCURRENCY` env variable per queue
- Monitor worker CPU/memory; scale horizontally if needed
- Use `ThrottlerGuard` for outbound notifications (SMS/Email/WhatsApp)

## 5. Object Storage (S3-Compatible)

### Storage Layout

| Bucket              | Purpose                                    | Access                          |
|---------------------|--------------------------------------------|---------------------------------|
| `servana-private`   | Documents, uploads, images (private)       | Presigned URLs, admin-only      |
| `servana-public`    | Public assets, CDN-served content           | CDN domain, anonymous read      |

### Daily Operations

| Task                      | Command/Procedure                                                  |
|---------------------------|----------------------------------------------------------------------|
| Verify bucket access      | `mc alias set local $MINIO_ENDPOINT $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD` |
| List private objects      | `mc la bucket/servana-private`                                       |
| Generate presigned URL    | `mc presign bucket/key --duration 1h`                                |
| Check CDN invalidation    | Verify cached objects after upload; purge if needed                   |

### Monitoring

- Storage usage — alert > 80% of bucket quota
- Egress metrics — unexpected spikes may indicate misconfiguration
- Access logs — review for unauthorized access attempts
- Set up lifecycle rules: transition to cold storage after 90 days, expire after 365 days

### Security

- Bucket policies: deny public ACLs, allow only presigned URLs for private bucket
- CDN origin restrictions — only allow authorized domains
- Encrypt sensitive documents at rest (S3 SSE-S3 or SSE-KMS)
- Rotate access keys quarterly

## 6. Monitoring Stack

### API Errors

| Metric                | Source                | Alert threshold |
|-----------------------|-----------------------|-----------------|
| `http_errors_total`   | NestJS `@nestjs/terminus` | > 5/minute      |
| `request_duration_ms` | Prometheus histogram  | p99 > 2s        |
| `sentry.events`       | Sentry ingestion      | Spike detection |

### Latency

| Metric                | Source | Threshold |
|-----------------------|--------|-----------|
| `api_latency_ms`      | custom middleware  | p95 > 1s, p99 > 3s |
| `db_query_duration_ms` | Prisma  | p99 > 500ms |
| `redis_op_duration_ms` | ioredis  | p99 > 50ms |

### Database

| Metric                | Source | Threshold |
|-----------------------|--------|-----------|
| `pg_connections`      | `pg_stat_activity` | > 80% of max |
| `pg_long_running`     | `pg_stat_activity` | > 5 min |
| `pg_backup_age`       | provider API   | > 24 hours |

### Redis

| Metric                | Source | Threshold |
|-----------------------|--------|-----------|
| `redis_memory_percent` | `INFO memory` | > 80% |
| `redis_latency_p99`     | `LATENCY`  | > 100ms |
| `redis_queue_depth`     | Keys       | > 1000 |

### Jobs

| Metric                | Source | Threshold |
|-----------------------|--------|-----------|
| `bullmq_failed_total` | BullMQ | > 5/hour |
| `bullmq_queue_depth`  | Redis    | > 1000 |
| `bullmq_processing_time` | BullMQ | p99 > 30s |

### Payment Webhooks

| Metric                | Source | Threshold |
|-----------------------|--------|-----------|
| `webhook_received_total` | NestJS filter | — |
| `webhook_verified_total` | HMAC verification | — |
| `webhook_invalid_sig`   | Rejected requests | > 0 |
| `webhook_replay_detected` | Dedup table | > 0 |

### Payment Failures

| Metric                | Source | Threshold |
|-----------------------|--------|-----------|
| `payment_failure_total`   | Payment service | > 3/day |
| `payout_failure_total`    | Payout service  | > 3/day |
| `refund_failure_total`    | Refund service  | > 3/day |

### AI Usage & Costs

| Metric                | Source | Threshold |
|-----------------------|--------|-----------|
| `ai_requests_total`   | Provider abstraction | — |
| `ai_tokens_total`     | Provider abstraction | — |
| `ai_cost_usd_day`     | Custom tracker | > $100/day alert |
| `ai_error_total`      | Provider errors | > 0 |

## 7. Deployment Checklist

### Pre-Deploy

- [ ] All CI/CD checks pass (lint, typecheck, tests, build, migration validation)
- [ ] Production secrets verified (not using placeholder values)
- [ ] Database backup taken
- [ ] Rollback plan documented and reviewed
- [ ] Staging environment tested with same migration
- [ ] Team notified of planned deployment window

### Post-Deploy

- [ ] Health endpoint returns `200`: `GET /api/v1/health`
- [ ] Key functionality tested: booking, payment, auth, webhooks
- [ ] Logs verified — no startup errors (`assertProductionSecrets`)
- [ ] Monitoring dashboards showing traffic/errors normally
- [ ] Sentry error feed cleared of new errors
- [ ] Backup verification passed

### Rollback Triggers

- Health check failure (non-200 response)
- Spike in error rate (> 2x baseline)
- Payment transaction failures
- Database migration regression
- Any critical security alert

## 8. Logs

### Log Structure

Production emits single-line JSON via `AppLoggerService` (dev stays human-readable):
- `level` — `info`, `warn`, `error`, `fatal`
- `time` — ISO timestamp UTC
- `msg` — human-readable message
- `context` — component/context (e.g., `Bootstrap`, `Http`, `Db`)
- `traceId` — request correlation ID
- `userId` — if applicable (redacted in production logs)
- `reqId` — request ID

### Log Locations

- **Container stdout/stderr** — captured by container orchestration
- **Sentry** — error tracking with stack traces
- **Application logs** — `NestLogger` → configured collector
- **Metrics** — scrape `GET /api/v1/health/metrics` (Prometheus format); restrict to scraper network

### Redaction Rules (per `SECURITY.md`)

- Never log: passwords, JWT tokens, PII (email/phone/address), verification document URLs, webhook signatures, refresh tokens
- Redactor interceptor strips PII from any object before logging
- `APP_ENV=production` enables strict redaction

## 9. Alerting

### Alert Channels

- **Slack** — `#alerts` channel for all production alerts
- **Email** — critical alerts only (page-level)
- **Sentry** — error tracking with issue assignment

### Alert Rules (summary)

| Component          | Condition                        | Severity |
|--------------------|----------------------------------|----------|
| API errors         | > 5 errors/minute                | high     |
| API latency p99    | > 3 seconds                      | medium   |
| DB connections       | > 80% of max                     | high     |
| Backup failure     | Last backup > 24 hours             | critical |
| Redis memory       | > 80% of allocated                 | high     |
| Redis latency p99  | > 100ms                          | medium   |
| Failed jobs        | > 5 per hour                     | high     |
| Payment webhook fail | Invalid signature detected       | critical |
| AI cost overrun     | > $100/day                       | medium   |
| Sentry new issues   | > 3 in 10 minutes                | high     |

## 10. Security Hardening (Operations)

### Rotation Schedule

| Secret/Key         | Rotation frequency |
|--------------------|--------------------|
| `JWT_ACCESS_SECRET`      | Every 90 days      |
| `JWT_REFRESH_SECRET`     | Every 90 days      |
| `MPESA_WEBHOOK_SECRET`   | Every 90 days      |
| `S3_ACCESS_KEY`/`S3_SECRET_KEY` | Every 90 days |
| `AI_PROVIDER_KEYS`       | Every 90 days      |

### Daily Security Checks

- [ ] `x-powered-by` disabled (enforced in `main.ts`)
- [ ] Helmet CSP + HSTS active (prod only)
- [ ] CORS origins explicit (no `*`)
- [ ] Rate limiting active (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`)
- [ ] No secrets in Docker image/environment outside secret manager
- [ ] AuditLog accessible only to `SUPER_ADMIN` role

### Incident Response

- See `INCIDENT_RESPONSE.md` for procedures
- Immediate: isolate the incident (disable endpoint, revoke keys)
- Short-term: fix root cause, deploy fix
- Long-term: post-mortem, prevent recurrence