import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, CalendarCheck, CreditCard, MapPin, Search, Sparkles } from 'lucide-react';
import { SearchBar } from '@/components/ui/search-bar';
import { SectionHeading } from '@/components/ui/tabs';
import { ProviderCard } from '@/components/marketplace/provider-card';
import { ServiceCard } from '@/components/marketplace/service-card';
import { ProductCard } from '@/components/marketplace/product-card';
import { CategoryGrid } from '@/components/marketplace/category-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchCategories, search } from '@/lib/api';
import { fetchProducts } from '@/lib/shop-api';
import { fetchProviders } from '@/lib/server-api';

export const metadata: Metadata = {
  title: 'Trusted Beauty & Personal-Care Marketplace',
  description:
    'Find verified hair, makeup, nails, barber, skincare and massage professionals near you. Transparent pricing, secure M-Pesa & card payments, real reviews.',
  alternates: { canonical: '/' },
};

const POPULAR_SEARCHES = ['Hair', 'Makeup', 'Nails', 'Barber', 'Skincare', 'Massage'];

export default async function HomePage() {
  const [{ data: providers }, products, categories, trending] = await Promise.all([
    fetchProviders().catch(() => ({ data: [], meta: { total: 0, pages: 0 } })),
    fetchProducts().catch(() => []),
    fetchCategories().catch(() => []),
    search({ pageSize: 6 }).catch(() => ({
      providers: [],
      services: [],
      meta: { totalProviders: 0, totalServices: 0, page: 1, pageSize: 6 },
    })),
  ]);

  const featuredProviders = providers.slice(0, 6);
  const trendingServices = trending.services.slice(0, 6);
  const featuredProducts = products.slice(0, 3);

  return (
    <main>
      {/* Hero — answers "what can I find here?" within 5 seconds */}
      <section className="border-b bg-gradient-to-b from-primary/[0.07] to-background" aria-labelledby="hero-heading">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:pt-14">
          <p className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
            Verified beauty &amp; personal-care professionals
          </p>
          <h1 id="hero-heading" className="type-display mt-4 max-w-3xl">
            Find trusted professionals near you.
          </h1>
          <p className="type-body-lg mt-3 max-w-2xl text-muted-foreground">
            Book hair, makeup, nails, barbering, skincare and massage from verified providers —
            with transparent pricing and secure payments.
          </p>
          <div className="mt-6 max-w-2xl">
            <SearchBar />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Popular:</span>
              {POPULAR_SEARCHES.map((term) => (
                <Link
                  key={term}
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className="rounded-full border bg-card px-3 py-1 text-[13px] font-medium transition-micro hover:border-primary hover:text-primary"
                >
                  {term}
                </Link>
              ))}
            </div>
          </div>
          <dl className="mt-8 grid max-w-2xl grid-cols-3 gap-3 text-sm">
            {[
              ['Verified pros', 'ID & skill checked'],
              ['Transparent prices', 'No hidden fees'],
              ['Secure payments', 'M-Pesa & cards'],
            ].map(([title, sub]) => (
              <div key={title} className="rounded-lg border bg-card px-3 py-2.5">
                <dt className="font-semibold leading-tight">{title}</dt>
                <dd className="mt-0.5 text-xs text-muted-foreground">{sub}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">
        {/* Categories */}
        <section aria-labelledby="categories-heading">
          <div id="categories-heading">
            <SectionHeading
              eyebrow="Categories"
              title="What do you need today?"
              description="Browse the most-booked beauty & personal-care categories."
              action={
                <Link href="/explore" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Explore all <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              }
            />
          </div>
          <div className="mt-5">
            <CategoryGrid />
          </div>
          {categories.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Plus {categories.length} curated platform categories — from hair to body care.
            </p>
          )}
        </section>

        {/* Recommended providers */}
        <section aria-labelledby="providers-heading">
          <div id="providers-heading">
            <SectionHeading
              eyebrow="Recommended"
              title="Verified providers"
              description="Independent professionals with verified identities, real reviews and transparent pricing."
              action={
                <Link href="/providers" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  View all providers <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              }
            />
          </div>
          {featuredProviders.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="Providers are joining now"
                description="Verified professionals will appear here as soon as they complete verification. Try search to explore services."
                actionLabel="Search services"
                actionHref="/search"
              />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} fromPrice={p.fromPrice} />
              ))}
            </div>
          )}
        </section>

        {/* Trending services */}
        <section aria-labelledby="services-heading">
          <div id="services-heading">
            <SectionHeading
              eyebrow="Trending"
              title="Popular services right now"
              description="Real services listed by verified providers — prices shown upfront."
              action={
                <Link href="/search" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Search services <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              }
            />
          </div>
          {trendingServices.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No trending services yet"
                description="Services appear here once providers publish them. Browse providers to see what's available."
                actionLabel="Browse providers"
                actionHref="/providers"
              />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trendingServices.map((s) => (
                <ServiceCard key={s.id} service={s} />
              ))}
            </div>
          )}
        </section>

        {/* Nearby */}
        <section aria-labelledby="nearby-heading" className="rounded-2xl border bg-card p-6 sm:p-8">
          <div id="nearby-heading">
            <SectionHeading
              eyebrow="Nearby"
              title="Explore providers near you"
              description="Share your area to see professionals who serve your neighbourhood — or who travel to you."
            />
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/search"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-micro hover:opacity-90"
            >
              <MapPin className="h-4 w-4" aria-hidden /> Find services near me
            </Link>
            <Link
              href="/assistant"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-6 text-[15px] font-medium transition-micro hover:bg-muted"
            >
              <Sparkles className="h-4 w-4" aria-hidden /> Ask the assistant
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            We never assume your location — you choose when and what to share.
          </p>
        </section>

        {/* Products */}
        <section aria-labelledby="products-heading">
          <div id="products-heading">
            <SectionHeading
              eyebrow="Shop"
              title="Beauty products, recommended by professionals"
              description="Aftercare and essentials — kept separate from service bookings for a clear checkout."
              action={
                <Link href="/products" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Shop all products <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              }
            />
          </div>
          {featuredProducts.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="Products coming soon"
                description="Professional-recommended products will appear here. Services are available now."
                actionLabel="Explore services"
                actionHref="/search"
              />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>

        {/* How it works */}
        <section aria-labelledby="how-heading">
          <div id="how-heading">
            <SectionHeading eyebrow="How it works" title="From discovery to glowing review" />
          </div>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Search, title: '1. Find', text: 'Search naturally — “Nails under KSh 2,000” — then compare verified pros.' },
              { icon: CalendarCheck, title: '2. Book', text: 'Pick a real available slot. No double-booking, no guesswork.' },
              { icon: CreditCard, title: '3. Pay', text: 'See subtotal, fees and total upfront. Backend-verified M-Pesa & cards.' },
              { icon: Sparkles, title: '4. Enjoy & review', text: 'Get the service, leave a verified review and earn rewards.' },
            ].map((s) => (
              <li key={s.title} className="card-rest p-5">
                <s.icon className="h-5 w-5 text-primary" aria-hidden />
                <p className="mt-2 font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Trust */}
        <section aria-labelledby="trust-heading" className="rounded-2xl border bg-muted/40 p-6 sm:p-8">
          <div id="trust-heading">
            <SectionHeading
              eyebrow="Trust & safety"
              title="Why customers book with confidence"
            />
          </div>
          <ul className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Verified providers', 'Identity & professional checks before listing.'],
              ['Secure payments', 'Confirmed by the backend — never by the screen you see.'],
              ['Transparent pricing', 'Service price, fees and total always shown before you pay.'],
              ['Real reviews', 'Only customers with completed bookings can review.'],
            ].map(([title, text]) => (
              <li key={title} className="rounded-lg border bg-card p-4">
                <p className="font-semibold">✓ {title}</p>
                <p className="mt-1 text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Provider CTA */}
        <section
          aria-labelledby="provider-cta-heading"
          className="overflow-hidden rounded-2xl bg-foreground text-background"
        >
          <div className="grid gap-6 p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 id="provider-cta-heading" className="type-h1">
                Turn your skills into income.
              </h2>
              <p className="mt-2 max-w-md text-[15px] opacity-80">
                Join the marketplace, list services in minutes, manage bookings and get paid —
                with performance insights that help you grow.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              <Link
                href="/provider/dashboard"
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-primary px-6 font-medium text-primary-foreground transition-micro hover:opacity-90"
              >
                Open provider dashboard
              </Link>
              <Link
                href="/providers"
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-background/30 px-6 font-medium transition-micro hover:bg-background/10"
              >
                See provider profiles
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
