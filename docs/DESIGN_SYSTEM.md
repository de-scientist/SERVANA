# SERVANA Design System

> Premium, modern, trustworthy, beauty-aware. Mobile-first. Semantic tokens, no hard-coded colours in components.

## 1. Colours (semantic tokens)

Defined in `apps/web/src/styles/globals.css`, consumed via Tailwind (`tailwind.config.ts`).

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` / `foreground` | warm paper / ink | deep plum-ink / warm white | page base |
| `surface` / `surface-elevated` | white | raised plum | cards, sheets |
| `border` / `input` / `ring` | warm grey / darker / brand | elevated equivalents | dividers, fields, focus |
| `primary` | SERVANA magenta `#C2247B` family (preserved brand) | brighter magenta | CTAs, links, active states |
| `secondary` | muted purple | lighter purple | secondary actions |
| `accent` | warm amber | warm amber | highlights, sale energy (sparingly) |
| `success` / `warning` / `danger` / `info` | emerald / amber / red / sky | tuned for dark contrast | status + feedback |
| `muted` / `muted-foreground` | warm grey wash | elevated wash | chips, skeletons, secondary text |
| `card` | white | raised plum | card surfaces |

Rules:

- Components use `bg-card`, `text-muted-foreground`, `border`, `bg-primary` — never hex literals.
- Status is never colour-alone: `StatusBadge` always pairs colour with text (`✓ Verified`, `PENDING`, `FAILED`).
- Dark mode is semantic (`.dark` overrides), never a naive invert. Forms, charts, cards and modals re-tested.

## 2. Typography

System stack: `Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif` (`--font-sans`).

| Style | Class | Size / weight / line-height |
|---|---|---|
| Display | `.type-display` | 36–60px, 700, 1.05, -0.02em |
| H1 | `.type-h1` | 30–36px, 700, 1.12 |
| H2 | `.type-h2` | 24px, 600, 1.2 |
| H3 | `.type-h3` | 20px, 600, 1.3 |
| H4 | `.type-h4` | 18px, 600, 1.35 |
| Body large | `.type-body-lg` | 16px, relaxed |
| Body | `.type-body` | 14px, relaxed |
| Body small | `.type-body-sm` | 13px, relaxed |
| Caption | `.type-caption` | 12px |
| Label | `.type-label` | 14px, 500 |

Semantic heading order is enforced per page (one `h1`, sections with `h2`).

## 3. Spacing

Tailwind default scale (4px base). Page rhythm:

- Section stack: `space-y-14` on homepage, `mt-6/8/10` inside pages.
- Card padding: `p-4` (dense) / `p-5` (default) / `p-6+` (feature).
- Max widths: content `max-w-6xl`, reading `max-w-2xl/3xl`, admin `max-w-7xl`.

## 4. Radius

Restrained: `--radius: 0.75rem`, `sm: 0.5rem`, pills only for badges/tabs (`full`).
No overly-rounded cards or neon shapes.

## 5. Shadows (elevation)

Three levels only: `--shadow-sm` (cards at rest), `--shadow-md` (hover/elevated), `--shadow-lg` (sheets/dialogs).
Tailwind: `shadow-soft`, `shadow-md`, `shadow-elevated`. No heavy glassmorphism.

## 6. Motion

| Token | Duration |
|---|---|
| `instant` | 80ms |
| `fast` | 150ms |
| `normal` | 240ms |
| `slow` | 400ms |

Easing: `cubic-bezier(0.22, 1, 0.36, 1)`. Micro-interactions only (button feedback, card hover, sheet open).
`prefers-reduced-motion: reduce` disables animation globally (see `globals.css`).

## 7. Components

Base (`components/ui`): `Button` (primary/secondary/outline/ghost/destructive; sm/md/lg),
`Input`, `Badge`, `Avatar`, `Rating` (backend aggregates only), `Price` (minor-units safe),
`StatusBadge`, `Tabs` (tablist semantics), `Breadcrumb`, `SectionHeading`, `SearchBar`,
`Sheet` + `ConfirmDialog` (accessible bottom-sheet on mobile), `DataTable` + `Pagination`,
`EmptyState` (title + description + next action), `ErrorState` (human-readable + retry),
`Skeleton` family (`ProviderCardSkeleton`, `CardGridSkeleton`, `ListSkeleton`), `Spinner`.

Marketplace (`components/marketplace`): `ProviderCard`, `ServiceCard`, `ProductCard` (visually
distinct from bookings), `CategoryGrid` (Hair/Makeup/Nails/Barber/Skincare/Massage, expandable).

Layout (`components/layout`): `SiteHeader` (sticky, lightweight), `SiteFooter`,
`BottomNav` (mobile customer nav: Home/Explore/Bookings/Rewards/Profile),
`ProviderShell` (12-item workspace nav), `AdminShell` (20-item ops nav), `AdminResourcePage`
(search + filter + table + pagination + export/print + honest empty/error states).

Booking (`components/`): `AvailabilityPicker` (available/selected/unavailable-closed/past,
unavailable never selectable, radiogroup semantics), `BookServicePanel`
(6-step: Service → Date & time → Details → Review → Payment → Done, with progress indicator;
payment success shown only after backend `GET /payments/:id` verification).

## 8. States

Every major view handles: loading (skeletons, not full-page spinners), success, empty
(with next action), error (human-readable + retry, no stack traces), unauthorized
(redirect to login), unavailable (honest "coming/rolling out" messaging).

## 9. Responsive

Breakpoints: 320 / 375 / 390 / 430 / 768 / 1024 / 1280 / 1440+.
Patterns: bottom nav + sticky booking CTAs on mobile; filter bottom-sheet (not sidebar) on
mobile; tables scroll horizontally with `min-width` (admin); grids `1 → 2 → 3` columns.

## 10. Accessibility rules

- Skip link, landmarks (`header`/`main`/`nav` with labels), one `h1` per page.
- Visible `:focus-visible` ring on all interactive elements.
- Labels for every field; `aria-checked`/`radiogroup` for slot pickers; `role=status/alert` for feedback.
- Touch targets ≥ 40–48px for primary controls; `prefers-reduced-motion` respected.
- Status never colour-alone; contrast from semantic tokens in both themes.

## 11. Usage examples

```tsx
import { ProviderCard } from '@/components/marketplace/provider-card';
<ProviderCard provider={p} fromPrice={p.fromPrice} />  // rating/stats only when backend-supplied

import { StatusBadge } from '@/components/ui/status-badge';
<StatusBadge status={booking.status} />

import { EmptyState } from '@/components/ui/empty-state';
<EmptyState title="No upcoming bookings" description="Your next appointment will appear here." actionLabel="Explore services" actionHref="/search" />
```
