# MASTER BUILD PROMPT — AI-POWERED SERVICE MARKETPLACE + BEAUTY COMMERCE PLATFORM

You are a **principal software architect, senior full-stack engineer, product designer, fintech systems architect, DevOps engineer, cybersecurity engineer, data engineer, and AI engineer** working as one team.

Your task is to design and implement a **production-ready, scalable, AI-powered multi-sided marketplace platform** that connects customers with verified service providers, enables service discovery and booking, supports direct digital payments, automatically calculates platform commissions and provider earnings, manages provider payouts, sells beauty products, maintains customer profiles and loyalty points, ranks providers using transparent performance metrics, and provides AI-powered recommendations, analytics, automation and support.

The product should initially focus on **beauty and personal-care services**, but the architecture MUST be designed so additional service categories can be introduced later without restructuring the entire system.

Do NOT treat this as a simple website.

This is a **marketplace platform + booking engine + payment/commission engine + e-commerce system + CRM + loyalty system + provider reputation system + analytics platform + AI intelligence layer**.

---

# 1. CORE PRODUCT VISION

Build a platform around this core journey:

> **Discover → Match → Compare → Book → Pay → Receive Service → Review → Earn Rewards → Return**

For providers:

> **Register → Verify → Create Profile → List Services → Receive Bookings → Complete Services → Get Paid → Build Reputation → Grow**

For products:

> **Discover → Product Details → Cart → Checkout → Payment → Fulfilment → Review → Repeat Purchase**

The platform should eventually become a digital operating system for local service businesses.

---

# 2. PRIMARY USER TYPES

Use a flexible role architecture.

Do NOT create completely separate user tables for customers and providers.

Use:

```text
User
 ├── Customer capabilities
 └── Provider capabilities
```

A single user should be able to act as both.

Example:

A makeup artist can provide makeup services while also booking a massage from another provider.

Implement role/capability-based permissions rather than hard-coding users into one permanent role.

Required account types/capabilities:

### Customer

Can:

* Register
* Login/logout
* Manage profile
* Search services
* Search providers
* View provider profiles
* View availability
* Book services
* Pay
* Cancel/reschedule bookings
* View booking history
* Buy products
* Leave reviews
* Earn loyalty points
* Redeem rewards
* Refer friends
* Save favourites
* Receive recommendations
* Manage notifications
* Contact support

### Provider

Can:

* Create provider profile
* Submit verification documents
* Create services
* Define pricing
* Define availability
* Define service radius
* Specify whether they travel to customers
* Upload portfolio images
* Receive/manage bookings
* Accept/reject bookings where appropriate
* Mark services completed
* View customers
* View earnings
* View commissions
* View payouts
* Manage products where applicable
* Receive reviews
* View performance analytics
* Access AI marketing tools
* Access AI business insights

### Administrator

Can:

* Manage users
* Manage providers
* Verify providers
* Manage services/categories
* Manage products
* Manage bookings
* Manage payments
* Manage payouts
* Manage commissions
* Manage loyalty
* Manage promotions
* Manage reviews
* Handle disputes
* Manage fraud flags
* View analytics
* Configure platform settings
* Manage AI features
* Manage content
* Manage notifications

Design permissions using RBAC/ABAC principles.

---

# 3. RECOMMENDED TECHNOLOGY STACK

Use:

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* React Hook Form
* Zod
* TanStack Query where appropriate
* Lucide icons

Use modern responsive design.

The interface must work beautifully on:

* Mobile
* Tablet
* Laptop
* Large desktop

Mobile should be treated as a first-class experience because social media will be a major acquisition channel.

---

# 4. BACKEND

Use:

### NestJS + TypeScript

Structure the backend into clear domain modules.

Suggested modules:

```text
auth
users
customers
providers
verification
services
categories
availability
bookings
payments
commissions
payouts
products
inventory
orders
reviews
ratings
loyalty
referrals
promotions
notifications
messaging
analytics
search
recommendations
ai
fraud
admin
audit
```

Do NOT turn everything into microservices immediately.

Start with a **modular monolith** with clean domain boundaries.

The architecture must allow individual modules to become independent services later.

---

# 5. DATABASE

Use:

### PostgreSQL

Use Prisma ORM unless the existing project has a strong reason to use another ORM.

Design proper relational models.

Core entities should include at minimum:

```text
User
UserRole
CustomerProfile
ProviderProfile
ProviderVerification
ProviderDocument
Category
Service
ServiceOption
ProviderService
Availability
Booking
BookingStatusHistory
Payment
PaymentTransaction
Commission
ProviderEarning
Payout
PayoutMethod
Product
ProductCategory
ProductVariant
Inventory
Cart
CartItem
Order
OrderItem
OrderStatusHistory
Review
ReviewResponse
LoyaltyAccount
LoyaltyTransaction
Reward
Referral
Promotion
Notification
Favourite
Message
Dispute
FraudAlert
AuditLog
SearchEvent
RecommendationEvent
AnalyticsEvent
```

Use:

* UUIDs
* timestamps
* soft deletion where appropriate
* proper foreign keys
* indexes
* unique constraints
* transaction-safe operations

Never rely on frontend validation for business rules.

---

# 6. MONEY AND FINANCIAL DATA

Money is critical.

Do NOT use floating-point numbers for financial calculations.

Use integer minor units where appropriate, e.g.:

```text
KES 2,000
→ 200000 minor units
```

or an appropriate precise decimal strategy.

Every financial transaction must have a complete audit trail.

Store:

```text
grossAmount
discountAmount
taxAmount
paymentFee
platformCommission
providerEarnings
netAmount
currency
paymentStatus
payoutStatus
paymentReference
payoutReference
```

Never calculate historical financial reports using the current commission configuration.

The commission applicable at transaction time must be persisted.

---

# 7. BOOKING ENGINE

Build a real booking system.

A booking should contain:

```text
Customer
Provider
Service
Date
Start Time
End Time
Location
Price
Status
Payment Status
Provider Status
Customer Status
Cancellation information
Notes
```

Booking statuses should include something like:

```text
PENDING
AWAITING_PAYMENT
PAID
CONFIRMED
PROVIDER_ACCEPTED
PROVIDER_REJECTED
IN_PROGRESS
COMPLETED
CANCELLED
NO_SHOW
DISPUTED
REFUNDED
EXPIRED
```

Use state transitions rather than allowing arbitrary status updates.

Every status change should be logged.

Prevent double-booking.

Use transactional database logic to protect availability.

---

# 8. SERVICE TYPES

Support different service delivery models:

### Customer visits provider

```text
AT_PROVIDER_LOCATION
```

### Provider travels to customer

```text
AT_CUSTOMER_LOCATION
```

### Remote service

```text
REMOTE
```

### Flexible

```text
EITHER
```

The architecture must support:

* Provider address
* Customer address
* Service location
* Travel radius
* Travel fee
* Location coordinates

Use geospatial capabilities where appropriate.

---

# 9. PROVIDER AVAILABILITY

Providers should be able to configure:

* Working days
* Working hours
* Breaks
* Holidays
* Time off
* Service duration
* Buffer time
* Maximum daily bookings
* Advance booking window

Example:

```text
Monday
09:00–17:00

Break
13:00–14:00

Service duration
60 minutes

Buffer
15 minutes
```

The booking engine must calculate actual available slots.

---

# 10. PROVIDER VERIFICATION

Build a provider verification system.

Verification levels:

```text
BASIC
PHONE_VERIFIED
IDENTITY_VERIFIED
PROFESSIONAL_VERIFIED
BUSINESS_VERIFIED
TRUSTED_PROVIDER
```

Support:

* Identity documents
* Certificates
* Business registration where applicable
* Profile review
* Admin verification
* Verification expiry
* Re-verification

Never expose sensitive verification documents publicly.

---

# 11. PROVIDER RANKING

Do NOT rank providers solely by stars.

Create a configurable Provider Quality Score.

Initial scoring model:

```text
30% Customer rating
20% Completed jobs
15% Repeat customer rate
10% Cancellation rate
10% Response rate/time
10% On-time completion
5% Verification/profile quality
```

Normalize metrics so providers with vastly different transaction volumes can be fairly compared.

Avoid allowing five reviews to automatically beat a provider with hundreds of successful jobs.

Use Bayesian or confidence-adjusted ratings where appropriate.

Display understandable signals to customers.

Example:

```text
4.9 ★
1,204 customers served
96% completion rate
98% response rate
Verified Professional
```

Do not expose the internal ranking formula in a way that makes manipulation easy.

---

# 12. REVIEWS

Reviews should only be allowed after valid completed transactions.

Support:

* Star rating
* Written review
* Service-specific rating
* Provider response
* Report review
* Admin moderation

Consider separate dimensions:

```text
Quality
Professionalism
Communication
Punctuality
Value
```

Use anti-review-manipulation controls.

---

# 13. PAYMENT ARCHITECTURE

The platform should support Kenyan payment workflows, especially:

### M-Pesa

Design an integration layer around a suitable payment provider/PSP and Safaricom Daraja where appropriate.

Do not hard-code the entire application directly to one payment provider.

Create:

```text
PaymentProvider
```

interface/abstraction.

Support future providers such as:

```text
M-Pesa
Card
Bank
Other PSP
```

The payment architecture must account for:

* Payment initiation
* Callback/webhook handling
* Payment verification
* Idempotency
* Failed payments
* Pending payments
* Duplicate callbacks
* Refunds
* Partial refunds where supported
* Reconciliation

Never trust the frontend to tell the backend that a payment succeeded.

The backend must verify payment status.

---

# 14. COMMISSION ENGINE

Create a configurable commission engine.

Commission may be:

```text
Percentage
Fixed amount
Category-specific
Provider-specific
Promotional
Tier-based
```

Example:

```text
Service price: KSh 2,000

Platform commission: 10%
Commission: KSh 200

Provider earnings: KSh 1,800
```

Persist the actual commission calculation on the transaction.

Allow future configuration such as:

```text
Standard provider → 10%
Premium provider → 8%
New provider → 5% for first 30 bookings
Category X → 12%
```

Do not modify historical transactions when commission settings change.

---

# 15. PROVIDER PAYOUTS

Build a payout ledger.

Provider dashboard should display:

```text
Gross earnings
Platform commission
Refunds
Adjustments
Pending earnings
Available balance
Paid out
Next payout
```

Support configurable payout methods.

Examples:

```text
M-Pesa
Bank
Other supported provider
```

Do not expose or store sensitive payment credentials unnecessarily.

Use secure payment-provider references/tokens.

---

# 16. PAYMENT STATE MACHINE

Create explicit states:

```text
INITIATED
PENDING
SUCCESSFUL
FAILED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
```

Payout states:

```text
PENDING
PROCESSING
SUCCESSFUL
FAILED
REVERSED
```

Use idempotency keys.

Every webhook must be safe to process more than once.

---

# 17. BEAUTY PRODUCT MARKETPLACE

Build a complete product marketplace.

Products should support:

* Product name
* Description
* Images
* Category
* Brand
* SKU
* Price
* Sale price
* Stock
* Variants
* Size
* Color
* Availability
* Seller/provider
* Product status

Categories may include:

```text
Hair
Skincare
Makeup
Nails
Body Care
Beauty Tools
Accessories
```

Support:

```text
Product
→ Cart
→ Checkout
→ Payment
→ Order
→ Fulfilment
→ Delivery/Pickup
→ Completed
```

---

# 18. SERVICE + PRODUCT CROSS-SELLING

Connect services and products.

Example:

Customer books:

```text
Hair braiding
```

System recommends:

```text
Hair oil
Edge control
Maintenance spray
```

After service completion:

```text
Recommended aftercare products
```

Use recommendation logic and eventually AI.

---

# 19. CUSTOMER CRM

Build a customer profile that captures legitimate platform activity.

Display:

```text
Customer profile

Bookings
Completed services
Cancelled services
Favourite providers
Product purchases
Reviews
Loyalty points
Rewards
Referrals
Preferred categories
Last activity
```

Do not expose sensitive internal analytics to other customers.

---

# 20. LOYALTY SYSTEM

Create a proper points ledger.

Examples:

```text
Account created → 10 points
Completed booking → 20 points
Review → 5 points
Referral → 50 points
Product purchase → configurable points
Repeat booking → bonus
```

Levels:

```text
NEW
BRONZE
SILVER
GOLD
PLATINUM
VIP
```

Allow admins to configure:

* Point earning rules
* Expiration
* Rewards
* Redemption
* Bonuses
* Promotional campaigns

Every points change must create a ledger transaction.

Never simply overwrite:

```text
points = 500
```

Instead:

```text
+20 booking
+50 referral
-100 reward redemption
```

---

# 21. REFERRAL SYSTEM

Give customers unique referral codes/links.

Track:

```text
Referrer
Referred user
Campaign
First booking
Reward status
```

Prevent referral abuse.

---

# 22. SOCIAL MEDIA ATTRIBUTION

Because customers will arrive through Instagram, TikTok, Facebook, WhatsApp and other channels, implement campaign attribution.

Track parameters such as:

```text
utm_source
utm_medium
utm_campaign
utm_content
referral_code
provider_slug
```

Example:

```text
Instagram
→ Provider profile
→ Booking
→ Payment
```

Admin should eventually see:

```text
Instagram
Bookings: 324
Revenue: KSh X
Conversion: X%
```

---

# 23. PROVIDER MINI-STORES

Every provider should have a shareable public page.

Example conceptual URL:

```text
/platform/provider/jane-beauty
```

It should contain:

* Profile
* Verification
* Services
* Prices
* Portfolio
* Reviews
* Availability
* Products
* Location
* Booking CTA

Make these pages SEO-friendly and social-share friendly.

Providers should be able to copy/share their profile link.

---

# 24. SEARCH

Build marketplace search around:

```text
Service
Provider
Category
Location
Price
Rating
Availability
Distance
Delivery/service type
```

Example query:

> "Makeup artist near Kilimani available Saturday under KSh 3,000."

The backend should be capable of translating this into structured filters.

Start with PostgreSQL search.

Architect for migration to OpenSearch/Elasticsearch later.

---

# 25. SMART MATCHING

Create a matching service.

Input:

```text
Customer request
Service
Location
Budget
Date
Time
Preferences
```

Consider:

```text
Provider availability
Distance
Service capability
Price
Quality score
Rating
Response rate
Completion rate
Customer preferences
Previous relationship
```

Return ranked recommendations.

Do not make AI the only matching mechanism.

Use deterministic business rules first, then AI-assisted ranking.

---

# 26. AI ARCHITECTURE

Create a dedicated AI module.

Do not scatter AI API calls throughout random React components.

Use a clean abstraction such as:

```text
AIProvider
AIService
RecommendationService
EmbeddingService
ModerationService
```

AI must be replaceable.

Do not hard-code the platform to one model vendor.

---

# 27. AI CUSTOMER ASSISTANT

Create an AI assistant capable of understanding requests such as:

> "I need a makeup artist tomorrow in Westlands for around 3,000 shillings."

Convert natural language into structured search criteria.

The AI should be able to:

```text
Understand intent
Extract service
Extract location
Extract budget
Extract date
Extract time
Find relevant providers
Explain recommendations
```

It should NOT directly execute sensitive actions without confirmation.

For example:

```text
AI:
"I found three providers. Would you like to book Sarah at 2 PM?"

Customer:
"Yes."

System:
"Please confirm payment of KSh 2,800."
```

Require confirmation before irreversible financial actions.

---

# 28. AI RECOMMENDATIONS

Build recommendation infrastructure.

Recommend:

### Providers

Based on:

* Customer history
* Service preferences
* Location
* Budget
* Provider quality
* Availability

### Services

Based on:

* Previous bookings
* Browsing
* Similar customers
* Current trends

### Products

Based on:

* Previous purchases
* Services booked
* Product compatibility
* Customer preferences

Start with rules + collaborative signals.

Introduce machine learning when enough data exists.

Do NOT pretend there is a sophisticated ML model before sufficient data exists.

---

# 29. AI CUSTOMER RETENTION

Detect patterns.

Example:

```text
Customer usually books every 5 weeks.

Last booking:
7 weeks ago.
```

Generate:

> "Your usual appointment may be due soon."

Allow automated campaigns only with user/admin-configurable rules.

---

# 30. AI CHURN PREDICTION

Create a future-ready churn scoring system.

Potential inputs:

```text
Days since last booking
Booking frequency
Cancellation behaviour
Engagement
Spend
Reviews
Support interactions
```

Output:

```text
LOW
MEDIUM
HIGH
```

Use this to trigger retention workflows.

---

# 31. AI REVIEW ANALYSIS

Analyze reviews for:

* Positive themes
* Negative themes
* Recurring complaints
* Strengths
* Weaknesses
* Sentiment
* Service quality

Provider dashboard:

```text
AI PERFORMANCE SUMMARY

Strengths:
• Professionalism
• Service quality
• Communication

Improvement:
• Punctuality
```

Never fabricate review insights.

Show that insights are generated from actual reviews.

---

# 32. AI MARKETING ASSISTANT FOR PROVIDERS

Create tools such as:

```text
Generate Instagram caption
Generate WhatsApp promotion
Generate service description
Generate product description
Generate campaign
Generate promotional message
Generate customer follow-up
```

Allow providers to choose:

```text
Tone:
Professional
Friendly
Luxury
Playful
Minimal
```

Do not automatically publish content without explicit authorization.

---

# 33. AI ADMIN COPILOT

Create an admin intelligence interface.

Admins should eventually be able to ask:

> "Why did bookings decline this week?"

> "Which service category is growing fastest?"

> "Which providers have the highest repeat-customer rates?"

> "How much commission did we generate this month?"

> "Which areas have high demand but insufficient providers?"

AI should query approved analytics tools/data services.

Never give the LLM unrestricted raw database access.

Use controlled tools/functions.

---

# 34. AI FRAUD DETECTION

Detect suspicious patterns such as:

* Multiple accounts from same device
* Abnormal booking frequency
* Fake review patterns
* Referral abuse
* Payment anomalies
* Customer/provider collusion
* Repeated cancellations
* Suspicious payout behaviour

Use:

```text
Rules
+
Anomaly detection
+
AI classification
+
Human review
```

AI flags suspicious activity.

It must NOT autonomously punish users based solely on an AI prediction.

---

# 35. AI SAFETY AND DATA PRIVACY

Never send unnecessary sensitive user information to external AI systems.

Implement:

* Data minimization
* PII filtering
* Prompt injection protection
* Output validation
* Rate limits
* Audit logging
* AI action logging
* Human escalation

Never allow an LLM to directly execute:

```text
Money transfer
Refund
Account deletion
Provider suspension
Commission modification
```

without deterministic authorization controls.

---

# 36. NOTIFICATIONS

Build notification infrastructure.

Channels:

```text
Email
SMS
Push
WhatsApp
In-app
```

Events:

```text
Booking created
Booking confirmed
Booking cancelled
Payment successful
Payment failed
Service reminder
Provider reminder
Review request
Payout completed
Promotion
Loyalty reward
Referral reward
```

Create notification templates rather than hardcoding messages throughout the application.

---

# 37. MESSAGING

Eventually allow customer/provider messaging.

Support:

* Booking-specific conversations
* Text
* Images where appropriate
* Read status
* Reporting
* Moderation
* Admin intervention

Do not expose personal phone numbers by default.

---

# 38. DISPUTE MANAGEMENT

Build a dispute system.

Customer can report:

```text
Service not delivered
Poor service
Payment problem
Provider issue
Product issue
```

Provider can report:

```text
Customer no-show
False complaint
Payment issue
Abuse
```

Admin can:

* Review evidence
* Refund
* Partially refund
* Reject claim
* Adjust payout
* Suspend account where justified

All decisions must be auditable.

---

# 39. ADMIN ANALYTICS

Build dashboards for:

### Marketplace

```text
Users
Providers
Bookings
Completion rate
Cancellation rate
Repeat customers
```

### Financial

```text
Gross transaction value
Platform commission
Provider earnings
Payment fees
Refunds
Payouts
Net revenue
```

### Products

```text
Orders
Sales
Best products
Inventory
Low stock
```

### Marketing

```text
Traffic
Source
Campaign
Conversion
Revenue
```

### Provider

```text
Top providers
Fastest growing providers
Highest rated
Most booked
Most reliable
```

---

# 40. DASHBOARD UX

Do NOT create generic admin dashboards full of meaningless cards.

Every metric must have purpose.

Use:

* Clear hierarchy
* Charts
* Trends
* Comparisons
* Filters
* Date ranges
* Export functionality
* Drill-down views

Example:

```text
Revenue
KSh 1.84M
↑ 14.2%

Bookings
3,421
↑ 8.7%

Commission
KSh 184K
↑ 11.3%

Repeat customers
42%
↑ 5.4%
```

---

# 41. CUSTOMER UX

Customer interface should feel:

**premium + trustworthy + modern + fast + human**

Primary navigation:

```text
Home
Explore
Bookings
Products
Rewards
Profile
```

Home should include:

```text
Search
Recommended services
Nearby providers
Popular services
Featured providers
Special offers
Products
Loyalty status
```

Avoid overwhelming the customer.

---

# 42. PROVIDER UX

Provider dashboard should prioritize:

```text
Today's bookings
Pending requests
Today's earnings
Upcoming bookings
Availability
Performance
```

Make it possible to complete common actions in a few taps.

---

# 43. DESIGN SYSTEM

Create a unified design system.

Use:

* Design tokens
* Typography scale
* Spacing system
* Border radius
* Shadows
* Component variants
* Responsive breakpoints
* Accessible color contrast

Use shadcn/ui as a foundation but customize it heavily enough that the platform has its own visual identity.

Do not make the application look like an untouched shadcn template.

Design direction:

**premium, modern, trustworthy, technology-driven, beauty-aware, clean and warm.**

Use subtle gradients and tasteful visual depth.

Avoid excessive glassmorphism.

Avoid unnecessary animations.

---

# 44. MOBILE-FIRST DESIGN

Social traffic will often arrive from:

```text
Instagram
TikTok
Facebook
WhatsApp
```

Therefore:

* Landing pages must load quickly
* CTAs must be obvious
* Booking must be mobile-friendly
* Payment must require minimal steps
* Provider profiles must be shareable
* Product pages must be responsive
* Forms must be easy on small screens

---

# 45. SEO AND SOCIAL SHARING

Implement:

* Metadata
* OpenGraph
* Twitter/X cards
* Structured data
* Canonical URLs
* Sitemap
* Robots configuration
* Dynamic provider pages
* Dynamic service pages
* Dynamic product pages

Generate SEO-friendly pages for:

```text
/services/[slug]
/providers/[slug]
/products/[slug]
/categories/[slug]
```

---

# 46. SECURITY

Implement production-grade security.

At minimum:

* Secure authentication
* Password hashing
* JWT/session security
* Refresh token rotation where applicable
* RBAC
* Input validation
* Rate limiting
* CSRF protection where applicable
* CORS configuration
* SQL injection protection
* XSS protection
* Secure headers
* File upload validation
* Malware-aware upload handling where feasible
* Audit logging
* Secrets management
* Webhook signature verification
* Idempotency

Never expose:

* Password hashes
* Payment credentials
* Verification documents
* Internal admin data
* Sensitive AI prompts
* Private customer information

---

# 47. AUDIT LOGGING

Important actions must be auditable.

Track:

```text
Who
What
When
Before
After
IP/device metadata where appropriate
```

Examples:

```text
Commission changed
Provider verified
Payout initiated
Refund issued
User suspended
Review removed
Admin changed system setting
```

---

# 48. EVENT-DRIVEN ARCHITECTURE

Create an internal event system.

Examples:

```text
USER_REGISTERED
BOOKING_CREATED
BOOKING_CONFIRMED
PAYMENT_SUCCESSFUL
SERVICE_COMPLETED
REVIEW_CREATED
ORDER_COMPLETED
POINTS_EARNED
POINTS_REDEEMED
PAYOUT_COMPLETED
```

These events can power:

* Notifications
* Analytics
* Loyalty
* Recommendations
* AI
* Marketing
* Fraud detection

Use queues/background jobs where appropriate.

Redis + BullMQ is a suitable option for asynchronous jobs.

---

# 49. SEARCH AND RECOMMENDATION EVENTS

Track meaningful user interactions:

```text
SEARCH_PERFORMED
SERVICE_VIEWED
PROVIDER_VIEWED
PRODUCT_VIEWED
BOOKING_STARTED
BOOKING_COMPLETED
FAVOURITE_ADDED
PRODUCT_ADDED_TO_CART
PRODUCT_PURCHASED
```

This creates the data foundation for future recommendation models.

Do not collect unnecessary data.

---

# 50. OBSERVABILITY

Implement:

* Structured logging
* Error tracking
* Performance monitoring
* API latency monitoring
* Database monitoring
* Background job monitoring
* Payment webhook monitoring

The system should make failures diagnosable.

---

# 51. TESTING

Create tests for:

### Unit

* Commission calculation
* Loyalty calculation
* Provider score
* Booking state transitions
* Pricing
* Referral rewards

### Integration

* Booking + payment
* Payment + commission
* Booking + payout
* Order + inventory
* Review + completed booking

### End-to-end

Test complete customer journey:

```text
Register
→ Search
→ Select provider
→ Book
→ Pay
→ Provider confirms
→ Service completed
→ Review
→ Points awarded
```

Also test provider journey.

---

# 52. PAYMENT TESTING

Payment tests must include:

```text
Successful payment
Failed payment
Pending payment
Duplicate webhook
Delayed webhook
Refund
Partial refund
Provider payout failure
Provider payout retry
```

Never mark a transaction successful solely because the frontend redirected successfully.

---

# 53. PERFORMANCE

Optimize for:

* Fast initial page load
* Image optimization
* Lazy loading
* Server-side rendering where appropriate
* Caching
* Database indexes
* Pagination
* Efficient queries
* Background jobs
* CDN delivery

Avoid N+1 queries.

Do not fetch huge datasets unnecessarily.

---

# 54. API DESIGN

Create clean REST APIs unless there is a compelling reason to use GraphQL.

Use versioning:

```text
/api/v1/
```

Example:

```text
GET    /api/v1/services
GET    /api/v1/services/:id
GET    /api/v1/providers
GET    /api/v1/providers/:id
POST   /api/v1/bookings
GET    /api/v1/bookings/:id
POST   /api/v1/payments
POST   /api/v1/reviews
GET    /api/v1/products
POST   /api/v1/orders
```

Use DTO validation.

Return consistent API responses and errors.

---

# 55. DOCUMENTATION

Create:

```text
README.md
ARCHITECTURE.md
API.md
DATABASE.md
PAYMENTS.md
AI.md
SECURITY.md
DEPLOYMENT.md
ENVIRONMENT.md
```

Document major architectural decisions.

---

# 56. ENVIRONMENT CONFIGURATION

Never hard-code:

* API keys
* Payment credentials
* AI API keys
* Database URLs
* JWT secrets
* OAuth secrets

Use environment variables.

Provide:

```text
.env.example
```

with safe placeholders.

---

# 57. SEED DATA

Create realistic development seed data.

Include:

```text
Admin users
Customers
Providers
Categories
Services
Products
Bookings
Reviews
Transactions
Loyalty points
```

Use realistic Kenyan context and KES pricing.

Do not use meaningless placeholder data such as:

```text
John Doe
Service 1
Product XYZ
Lorem ipsum
```

Use realistic but fictional data.

---

# 58. EMPTY STATES

Every dashboard and marketplace page needs useful empty states.

Example:

Instead of:

> "No data."

Use:

> "You haven't made your first booking yet. Explore popular services near you."

Include useful CTAs.

---

# 59. ERROR HANDLING

Errors should be:

* Human-readable
* Actionable
* Consistent
* Logged internally

Example:

Instead of:

> `500 Internal Server Error`

Customer sees:

> "We couldn't confirm your booking right now. Your payment has not been confirmed. Please try again."

---

# 60. ADMIN CONFIGURATION

Avoid hardcoding business rules.

Allow administrators to configure:

```text
Commission rates
Loyalty rules
Provider ranking weights
Booking cancellation windows
Minimum provider requirements
Promotions
Reward rules
Categories
Service categories
Payment settings
Notification templates
```

Protect these settings with proper authorization and audit logging.

---

# 61. FUTURE FEATURES — ARCHITECT FOR THEM, DON'T OVERBUILD THEM

Leave clean extension points for:

### Multi-provider packages

Example:

```text
Hair
+
Makeup
+
Nails
```

### Corporate accounts

Hotels, companies, events and institutions.

### Subscriptions

Customer memberships.

### Provider subscriptions

Premium provider accounts.

### Featured providers

Paid visibility.

### Advertising

Beauty brands.

### Delivery

Product logistics.

### WhatsApp marketplace

Natural-language booking.

### Mobile applications

React Native/Expo later.

---

# 62. IMPORTANT PRODUCT PRINCIPLE

Do not build every advanced feature immediately.

Divide implementation into:

## MVP

Must work:

```text
Authentication
Profiles
Providers
Services
Search
Availability
Booking
Payment
Commission
Payout tracking
Reviews
Products
Orders
Basic loyalty
Admin
```

## PHASE 2

```text
Advanced provider ranking
Referrals
Promotions
Messaging
Advanced analytics
Provider mini-stores
Social attribution
```

## PHASE 3

```text
AI assistant
AI recommendations
AI review intelligence
AI marketing
AI churn prediction
AI fraud detection
AI admin copilot
WhatsApp AI
```

The architecture should support all three phases.

---

# 63. DO NOT FAKE FUNCTIONALITY

This is extremely important.

Do NOT create buttons that appear functional but do nothing.

Do NOT create:

```text
Fake payment success
Fake payout
Fake AI
Fake analytics
Fake provider ranking
Fake booking availability
```

If an external integration cannot yet be connected, create a properly isolated adapter/service and clearly expose its development/mock mode.

Never pretend mock functionality is production functionality.

---

# 64. EXISTING CODEBASE RULE

If this prompt is being applied to an existing project:

FIRST:

1. Inspect the entire repository.
2. Identify the current architecture.
3. Identify the existing framework.
4. Identify the database.
5. Identify existing authentication.
6. Identify existing API structure.
7. Identify existing UI components.
8. Identify existing business logic.
9. Identify existing integrations.
10. Identify technical debt.
11. Identify broken functionality.
12. Identify duplicated components.
13. Identify security risks.

Do NOT blindly rewrite the project.

Preserve good existing functionality.

Refactor where necessary.

---

# 65. BEFORE CODING

Create an implementation plan.

First provide:

```text
1. Current architecture assessment
2. Target architecture
3. Database ERD
4. Core entities
5. API architecture
6. Authentication strategy
7. Payment architecture
8. Commission architecture
9. Booking state machine
10. Loyalty architecture
11. Provider ranking architecture
12. AI architecture
13. Security architecture
14. Deployment architecture
15. MVP roadmap
```

Then identify:

```text
Critical dependencies
Potential risks
Regulatory considerations
Payment risks
Scalability risks
Security risks
Data/privacy risks
```

Only after this assessment should implementation begin.

---

# 66. IMPLEMENTATION ORDER

Build in this order:

### STEP 1

Project foundation

### STEP 2

Authentication + authorization

### STEP 3

Users + profiles

### STEP 4

Provider onboarding + verification

### STEP 5

Categories + services

### STEP 6

Availability engine

### STEP 7

Search + discovery

### STEP 8

Booking engine

### STEP 9

Payment abstraction

### STEP 10

Commission engine

### STEP 11

Provider earnings + payout ledger

### STEP 12

Reviews + provider ranking

### STEP 13

Products + inventory

### STEP 14

Cart + orders

### STEP 15

Loyalty

### STEP 16

Referrals + promotions

### STEP 17

Notifications

### STEP 18

Analytics

### STEP 19

AI foundation

### STEP 20

AI recommendations

### STEP 21

AI customer assistant

### STEP 22

AI provider assistant

### STEP 23

AI admin intelligence

### STEP 24

Fraud/anomaly detection

### STEP 25

Security hardening

### STEP 26

Testing

### STEP 27

Performance optimization

### STEP 28

Production deployment

---

# 67. DEVELOPMENT WORKFLOW

For every major implementation step:

1. Inspect existing code.
2. Explain what needs to change.
3. Implement.
4. Run type checking.
5. Run linting.
6. Run tests.
7. Fix errors.
8. Check responsive UI.
9. Check accessibility.
10. Verify database migrations.
11. Verify API behaviour.
12. Verify security implications.
13. Update documentation.
14. Summarize exactly what changed.

Never move forward while knowingly leaving build-breaking errors.

---

# 68. CODE QUALITY

Use:

* Strong TypeScript types
* Clear naming
* Small reusable components
* Domain-oriented services
* DTO validation
* Error boundaries
* Proper loading states
* Proper error states
* No duplicated business logic
* No magic numbers
* No unnecessary dependencies
* No dead code
* No unused imports
* No console logging in production paths

Follow SOLID principles where useful without creating unnecessary abstraction.

---

# 69. ACCESSIBILITY

Target WCAG 2.2 AA where practical.

Ensure:

* Keyboard navigation
* Focus states
* Semantic HTML
* Accessible forms
* Screen-reader labels
* Color contrast
* Reduced motion support
* Accessible dialogs
* Accessible tables
* Accessible error messages

---

# 70. FINAL QUALITY BAR

The finished product should feel like a serious commercial platform—not a university project or generic CRUD dashboard.

It should feel:

**Trusted.**
**Fast.**
**Premium.**
**Modern.**
**Local.**
**Scalable.**
**Intelligent.**
**Human.**

The customer should immediately understand:

> "I can find a professional, book them, pay safely and get the service."

The provider should immediately understand:

> "This platform can bring me customers and help me grow my business."

The administrator should immediately understand:

> "I can control the marketplace, money, providers, customers and performance."

And the AI should eventually understand:

> **What customers want, what providers need, where demand is emerging, what is going wrong, and what the platform can do next.**

---

# 71. FINAL INSTRUCTION TO THE DEVELOPMENT AGENT

Do not rush into generating hundreds of files.

Think like a principal engineer.

**Inspect → Architect → Model → Implement → Test → Validate → Refine.**

Prioritize:

```text
Correctness
Security
Financial integrity
Data integrity
User experience
Maintainability
Scalability
Observability
AI readiness
```

over superficial feature count.

If a requirement is ambiguous, identify the ambiguity and make the safest production-grade assumption rather than silently implementing a potentially dangerous interpretation.

If an external payment, messaging, AI or third-party service requires credentials, isolate it behind an adapter and clearly identify the required environment variables.

If a feature has regulatory implications—particularly payments, money movement, identity verification, data privacy or financial records—flag it explicitly before production deployment.

Build the foundation correctly.

Do not optimize for the demo.

**Build for the marketplace this can become.**
