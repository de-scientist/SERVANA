# AI.md — AI Readiness & Strategy

> Phase 0 blueprint. **No AI is implemented in this phase.** This document
> defines the data foundation, abstraction, and governance so AI can be added
> later without rework or vendor lock-in.

---

## 1. Principles

1. **Abstraction over coupling.** All AI goes through the `ai` module's
   `AIProvider` interface. No React component or domain module calls an LLM SDK
   directly.
2. **Deterministic first, ML later.** Recommendations/matching start as rules +
   structured signals. Introduce learning models only when data volume justifies
   it (avoid fake sophistication — per spec §28).
3. **PII minimization.** Raw personal data is never sent to external models.
   Only typed IDs + necessary derived signals are passed; PII filtering is a
   gateway in the `ai` module.
4. **No autonomous irreversible actions.** Money movement, refunds, account
   suspension, commission changes require deterministic authorization + human
   confirmation. LLM may *propose*, never *execute* (spec §35).
5. **Auditable.** Every AI call (prompt hash, model, output, actor) is logged to
   `AuditLog`/`AnalyticsEvent`.
6. **Replaceable.** Swap vendors (OpenAI/Anthropic/local) via config; prompts
   versioned.

---

## 2. AI Module Design

```
ai/
  AIProvider            (interface: complete, embed, moderate, classify)
  providers/            (OpenAIProvider, AnthropicProvider, LocalProvider)
  AIService             (orchestration, prompt registry, PII filter)
  ModerationService     (input/output safety)
  EmbeddingService      (vectorize providers/services/products)
  RecommendationService (rules now, ML later)
  PromptRegistry        (versioned prompt templates)
  AIAuditInterceptor    (logs every call)
```

`AIProvider` interface (contract):
```ts
interface AIProvider {
  id: string;
  complete(opts: AIRequest): Promise<AIResponse>;
  embed(text: string): Promise<number[]>;
  moderate(text: string): Promise<ModerationResult>;
}
```

---

## 3. Event-Driven Foundation (powers AI)

The domain EventBus (see ARCHITECTURE.md §9) already emits events AI consumes
asynchronously:

| Event | Emitted by | Consumed by (AI) |
|-------|-----------|------------------|
| `USER_REGISTERED` | auth | recommendations (cold-start) |
| `BOOKING_CONFIRMED` | bookings | retention, churn signals |
| `SERVICE_COMPLETED` | bookings | review analysis, ranking |
| `REVIEW_CREATED` | reviews | review intelligence, ranking |
| `ORDER_COMPLETED` | orders | product recs, churn |
| `POINTS_EARNED` | loyalty | retention |
| `PAYOUT_COMPLETED` | payouts | provider health |
| `SEARCH_PERFORMED` / `*_VIEWED` | search/analytics | recs, embeddings |

AI never polls the DB; it reacts to events + reads materialized read-models.

---

## 4. Capability Roadmap (data required)

### 4.1 Recommendation engine
* **Now:** deterministic — category affinity, past bookings, location, price
  band, provider quality score. Source: `Booking`, `Order`, `Favourite`,
  `SearchEvent`, `ProviderRankingSnapshot`.
* **Later:** collaborative filtering / embeddings from `RecommendationEvent`.
* Avoids cold-start fakery by falling back to popularity/nearby.

### 4.2 Customer retention
* Signals: days-since-last-booking, frequency, spend (`Booking`,
  `LoyaltyTransaction`). Trigger re-engagement only with configurable rules.

### 4.3 Churn prediction
* Inputs: recency/frequency/monetary, cancellations, review sentiment, support
  contacts. Output `LOW/MEDIUM/HIGH`. Human-in-loop workflows only.

### 4.4 Provider matching
* Deterministic scoring first (availability, distance, price, quality,
  response). AI re-ranks using embeddings later. No AI-only matching (spec §25).

### 4.5 Review intelligence
* Summarize `ReviewDimension` themes (strengths/improvements). Must cite actual
  reviews; never fabricate (spec §31). Output validated + shown as derived.

### 4.6 Fraud detection
* `fraud` module: rules + anomaly + AI classification score → `FraudAlert`.
  AI flags only; human review decides. Never auto-punish (spec §34).

### 4.7 AI customer assistant
* NL → structured search criteria (service, location, budget, date, time).
  Proposes providers; requires explicit confirmation before any payment.

### 4.8 AI provider marketing assistant
* Generates captions/descriptions from provider data + chosen tone. Never
  auto-publishes; explicit authorization required.

### 4.9 AI admin copilot
* Answers via **controlled tools** over analytics read-models. No raw DB access;
  no SQL generation from free text without sandbox + allow-list.

---

## 5. Data Collection Responsibility

Collect only what is needed and minimize PII sent to models:
* Use internal IDs, not names/emails/phones, in prompts.
* Strip free-text reviews of direct PII before embedding/summarization.
* Store embeddings separately; allow deletion on erasure request.
* Respect consent: analytics/AI personalization opt-out honored via `User`
  preferences.

---

## 6. Safety & Governance

* **Prompt injection:** user content is treated as data, never as instruction
  (system prompt isolation). Output validated against schema.
* **Rate limits** on AI endpoints per user/role.
* **Output validation** via Zod before any downstream use.
* **AI action log** in `AuditLog` (`action: "ai:<capability>"`).
* **Human escalation** path for every AI-proposed sensitive action.

---

## 7. Phase Gate

AI capabilities are introduced in **Phase 5**, after the event/analytics
foundation (Phases 1–4) exists. Recommendation/matching v1 is rules-based.
