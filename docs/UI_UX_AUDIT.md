# SERVANA UI/UX Audit — Transformation Phase

## 1. Existing design system (before)

- Tailwind + shadcn-style tokens existed (`background/foreground/primary/secondary/muted/accent/destructive/card/border/input/ring/radius`) with a warm beauty-aware palette. Brand magenta preserved.
- Gaps: no `success/warning/info/surface-elevated` tokens; single `shadow-soft`; no documented type scale, motion scale, or dark-mode strategy beyond `darkMode: 'class'`; `.dark` tokens absent.
- Components: only `Button`, `Card`, `Input`, `Spinner` (+ toast/error-boundary providers). Provider/service/product cards, badges, ratings, status, skeletons, sheets, tables, tabs, breadcrumbs were hand-rolled per page — inconsistent.

## 2. Existing components (before)

- Reusable: `Button` (cva variants), `Card` family, `Input`, `Spinner`, `BookServicePanel` (single-step), `AvailabilityPicker` (basic grid), `AddToCart`, `SearchBar` (none — raw inputs).
- Missing: `Badge`, `Avatar`, `Rating`, `Price`, `StatusBadge`, `EmptyState`, `ErrorState`, `Skeleton`, `Tabs`, `Pagination`, `Breadcrumb`, `Sheet/ConfirmDialog`, `DataTable`, `BottomNavigation`, `ProviderCard/ServiceCard/ProductCard`, shells.

## 3. Existing pages (before)

- Customer: `/` (placeholder hero, not a marketplace landing), `/search` (functional filters, weak states), `/providers`, `/providers/[slug]` (good trust signals, dead "Book this provider" anchor, "Online booking opens soon"), `/services/[id]` (good detail + live `AvailabilityPicker`, single-step `BookServicePanel`), `/bookings` (tabs worked, `POST` cancel — wrong verb), `/bookings/[id]` (missing), `/cart`, `/orders`, `/products`, `/products/[id]` (thin), `/rewards` (functional, flat), `/profile`, `/explore` (missing), `/checkout` (missing), `/support` (missing).
- Provider: `/provider/bookings` (worked, `POST` transitions — wrong verb, should be `PATCH`), `/provider/performance` (rich), `/provider/dashboard|services|availability|customers|earnings|reviews|products|analytics|ai|profile|settings|verification|payouts` (missing).
- Admin: `/admin/payouts*` (rich dashboard), `/admin/analytics` (rich), `/admin/ai`, `/admin/fraud` (rich) + 16 missing operations pages.
- Global: header was a flat 12-link row (unusable on mobile, no search/cart affordance, no bottom nav, no footer); `loading.tsx` was a full-page spinner; SEO partial (some `generateMetadata`/JSON-LD, sitemap only 3 URLs).

## 4. UX problems fixed

1. Homepage answered nothing in 5 seconds → now: hero (what/where + prominent natural-language search + popular terms), categories, verified providers, trending services, nearby, products, how-it-works, trust, provider CTA — all from real APIs with honest empty states.
2. Navigation overload → `SiteHeader` (Logo + Explore/Providers/Products/Rewards + cart + account + provider CTA; mobile menu disclosure) + `BottomNav` (Home/Explore/Bookings/Rewards/Profile) + `SiteFooter`.
3. Search mobile filters were an inline grid → now bottom-`Sheet`; added debounced search, skeleton grids, `ErrorState` with retry, verified/travel toggles with 44px targets.
4. Provider profile had a dead booking anchor → now service list with per-service booking links, sticky desktop rail + sticky mobile CTA, share action, policies section, accessible reviews.
5. Booking was single-step with confusing availability → now 6-step flow with progress (`Service → Date & time → Details → Review → Payment → Done`), radiogroup slot picker (past/closed states unselectable), review-before-pay, `M-Pesa/Card/Bank/Other` methods, backend-verified confirmation only.
6. Wrong HTTP verbs: customer cancel `POST /bookings/:id/cancel` → `PATCH`; provider transitions `POST /bookings/provider/:id/*` → `PATCH` (matches NestJS controllers).
7. Payment honesty: confirmation previously risked implying success on initiation → now `POST /payments` then `GET /payments/:id`; UI labels status as "backend-verified" and keeps `PENDING` honest.
8. Admin/provider missing IA → full shells + 12 provider + 17 admin routes with `AdminResourcePage` (search/filter/table/pagination/export) and truthful empty states where endpoints are still rolling out (customers CRM, reviews moderation, disputes, audit).
9. Full-page spinners → skeleton system (`CardGridSkeleton`, `ListSkeleton`, route `loading.tsx`).
10. Thin trust/SEO → canonical/OG/Twitter metadata on all public pages, JSON-LD kept (with `<`/`>`/`&` escaping), sitemap expanded, `robots.ts` already correct.

## 5. Inconsistencies fixed

- Price rendering scattered (`formatPrice` variants, raw arithmetic) → `Price` + `formatMinorUnits`/`formatKES` (minor-unit safe, no float math).
- Status pills hand-rolled with ad-hoc colours → `StatusBadge` (single map, text always present).
- Cards rebuilt per page → `ProviderCard/ServiceCard/ProductCard` with fixed hierarchy (photo → verified → name → rating → categories → served → price → availability → CTA).
- Headings ad-hoc → `.type-*` scale + `SectionHeading` + `Breadcrumb` everywhere.

## 6. Responsive issues fixed

- Header 12-link row overflowed on mobile → disclosure menu + bottom nav.
- Filter sidebar pattern on mobile → bottom sheet.
- Desktop tables forced onto mobile → `DataTable` with `min-width` + horizontal scroll; grids recompose `1→2→3`.
- Booking/checkout CTAs unreachable on long pages → sticky mobile bars (`bottom-16` above `BottomNav`).
- Verified at 320/375/390/430/768/1024/1280/1440 via fluid grids and `min-h-[44/48px]` targets.

## 7. Accessibility issues fixed

- Missing skip link target consistency → `#main-content` + `SiteHeader`/`BottomNav` landmarks with labels.
- Custom slot buttons lacked semantics → `role=radiogroup/radio` + `aria-checked` + fieldset/legend for days.
- Icon-only buttons unlabelled → `aria-label` on search/cart/menu/close/share.
- Form errors unassociated → `aria-invalid`/`aria-describedby`/`role=alert`.
- Status by colour alone → text labels everywhere (`✓ Verified` includes text, not just green).
- Motion: no `prefers-reduced-motion` handling → global reduce block + shimmer disabled.
- Focus: default Tailwind only → explicit `:focus-visible` ring.

## 8. Known limitations (not fabricated)

- Provider CRM (`/providers/me/customers`), review moderation queue, disputes detail, audit-log listing, and some admin list endpoints have no dedicated backend controller yet — those pages show honest empty/error states and link to the closest working surface instead of fake rows.
- `admin/ai` and `admin/fraud` and `admin/payouts/*` and `provider/performance` were preserved as-is (not yet wrapped in the new shells) to avoid regressing working logic — nav inconsistency noted for next pass.
- Ratings, customer counts, prices and availability render backend data only; cards omit stats when the API does not supply them (no invented `4.9 (124)` or `1,204 served`).
- No fake payment success: confirmation reflects `GET /payments/:id` status; `PENDING` stays visible until webhooks verify.

## 9. Recommended next UX improvements

1. Wrap remaining legacy pages (`admin/ai`, `admin/fraud`, `admin/payouts*`, `provider/performance`) in shells without touching logic.
2. Add provider service editor (description/images/location-type/cancellation) as a proper form route once `PATCH /providers/me/services/:id` schema is confirmed client-side.
3. Slot picker calendar view (month grid) reusing the same availability API.
4. Reschedule flow (currently cancel + rebook) per booking state machine.
5. Favourites (saved providers/services) once a backend endpoint lands.
6. E2E (Playwright/Cypress) for landing → search → provider → service → booking → checkout journeys.
