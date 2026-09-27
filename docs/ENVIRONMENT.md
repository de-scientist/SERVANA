# ENVIRONMENT.md — Environment Configuration Reference

> Phase 0 blueprint. Never commit real secrets. Provide `.env.example` with
> safe placeholders. Values listed here are the contract for Phase 1 setup.

---

## 1. Application

```
APP_NAME=SERVANA
APP_ENV=development            # development | staging | production
API_BASE_URL=http://localhost:3001
WEB_BASE_URL=http://localhost:3000
PORT=3001
```

## 2. Database

```
DATABASE_URL=postgresql://user:pass@localhost:5432/servana?schema=public
```

## 3. Redis / Queue

```
REDIS_URL=redis://localhost:6379
BULLMQ_PREFIX=servana
```

## 4. Authentication

```
JWT_ACCESS_SECRET=__CHANGE_ME__
JWT_REFRESH_SECRET=__CHANGE_ME__
JWT_ACCESS_TTL=900            # seconds
JWT_REFRESH_TTL=1209600
MFA_ISSUER=SERVANA
```

## 5. Object Storage (S3-compatible)

```
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=__CHANGE_ME__
S3_SECRET_KEY=__CHANGE_ME__
S3_BUCKET_PRIVATE=servana-private
S3_BUCKET_PUBLIC=servana-public
S3_PUBLIC_URL=http://localhost:9000/servana-public
```

## 6. Payments (PSP adapters)

```
PAYMENT_DEFAULT_PROVIDER=mpesa
MPESA_CONSUMER_KEY=__CHANGE_ME__
MPESA_CONSUMER_SECRET=__CHANGE_ME__
MPESA_PASSKEY=__CHANGE_ME__
MPESA_SHORTCODE=__CHANGE_ME__
MPESA_ENV=sandbox            # sandbox | production
MPESA_WEBHOOK_SECRET=__CHANGE_ME__
# Future: STRIPE_SECRET_KEY, BANK_*
```

## 7. Notifications

```
EMAIL_API_KEY=__CHANGE_ME__
SMS_API_KEY=__CHANGE_ME__
PUSH_API_KEY=__CHANGE_ME__
WHATSAPP_API_TOKEN=__CHANGE_ME__
```

## 8. AI (provider abstraction)

```
AI_DEFAULT_PROVIDER=openai
AI_PROVIDER_OPENAI_KEY=__CHANGE_ME__
AI_PROVIDER_ANTHROPIC_KEY=__CHANGE_ME__
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_REQUEST_TIMEOUT_MS=30000
AI_ENABLE_MODERATION=true
```

## 9. Security / Rate limiting

```
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
CORS_ORIGINS=http://localhost:3000
```

## 10. Misc

```
LOG_LEVEL=info
ATTRIBUTION_COOKIE_TTL_DAYS=30
```

---

## Notes

* Provide a `.env.example` committed to the repo with placeholder values only.
* Production secrets come from the platform secret manager; never stored in git.
* Rotate `JWT_*_SECRET`, `MPESA_*`, `AI_*`, `S3_*` on a schedule.
