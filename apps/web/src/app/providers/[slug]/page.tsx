import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BadgeCheck, MapPin, Share2 } from 'lucide-react';
import { fetchProvider, fetchProviderReviews, formatPrice } from '@/lib/server-api';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Rating } from '@/components/ui/rating';
import { Breadcrumb } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const p = await fetchProvider(params.slug);
  if (!p) return { title: 'Provider not found' };
  const title = `${p.businessName ?? 'Provider'}`;
  const description = p.tagline ?? p.bio ?? `Book ${p.businessName} on SERVANA — verified reviews, transparent pricing.`;
  return {
    title,
    description,
    alternates: { canonical: `/providers/${p.slug}` },
    openGraph: { title, description, url: `/providers/${p.slug}`, type: 'profile' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function ProviderPage({ params }: PageProps) {
  const p = await fetchProvider(params.slug);
  if (!p) notFound();
  const reviews = await fetchProviderReviews(p.id);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: p.businessName,
    description: p.bio ?? p.tagline,
    areaServed: p.city,
    url: `${process.env.NEXT_PUBLIC_WEB_URL ?? 'https://servana.app'}/providers/${p.slug}`,
    ...(p.verification.verified ? { award: 'SERVANA Verified Provider' } : {}),
    makesOffer: p.services.map((s) => ({
      '@type': 'Offer',
      name: s.name,
      price: s.price,
      priceCurrency: s.currency,
    })),
  };

  const lowest = p.services.length > 0 ? Math.min(...p.services.map((s) => s.price)) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-28 lg:pb-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') }} />

      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Providers', href: '/providers' }, { label: p.businessName ?? 'Provider' }]} />

      {/* Identity */}
      <header className="mt-4 rounded-2xl border bg-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={p.businessName} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-h1">{p.businessName}</h1>
              {p.verification.verified && (
                <Badge variant="success" className="gap-1">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  ✓ Verified {(p.verification.level ?? '').replace(/_/g, ' ').toLowerCase()}
                </Badge>
              )}
            </div>
            {p.tagline && <p className="mt-1.5 text-muted-foreground">{p.tagline}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" aria-hidden />
              {[p.city, p.country].filter(Boolean).join(', ') || 'Location shared at booking'}
              {p.travelToCustomer ? ' · Travels to you' : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.categories.map((c) => (
                <Badge key={c.id}>{c.name}</Badge>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <Button asChild className="min-h-[48px] px-6">
              <Link href="#book">Book a service</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-[44px]">
              <Link href={`/providers/${p.slug}?share=1`} aria-label="Share provider profile">
                <Share2 className="h-4 w-4" aria-hidden /> Share
              </Link>
            </Button>
          </div>
        </div>

        {p.bio && <p className="mt-5 max-w-3xl leading-relaxed text-foreground/90">{p.bio}</p>}

        {/* Trust signals */}
        <section aria-label="Trust signals" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <TrustMetric
            value={p.reviews.overall > 0 ? `${p.reviews.overall.toFixed(1)} ★` : 'New'}
            label={`${p.reviews.total} verified review${p.reviews.total === 1 ? '' : 's'}`}
            extra={<Rating value={p.reviews.overall > 0 ? p.reviews.overall : null} count={null} showCount={false} />}
          />
          <TrustMetric value={p.reviews.customersServed.toLocaleString()} label="customers served" />
          <TrustMetric value={`${p.reviews.completionRate}%`} label="completion rate" />
          <TrustMetric value={`${p.reviews.responseRate}%`} label="response rate" />
          <TrustMetric
            value={p.verification.verified ? '✓ Verified' : 'Unverified'}
            label={p.verification.level?.replace(/_/g, ' ').toLowerCase() ?? 'identity not yet verified'}
          />
        </section>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          {/* Services */}
          <section id="book" aria-labelledby="services-h" className="scroll-mt-24">
            <h2 id="services-h" className="type-h2">Services</h2>
            <p className="mt-1 text-sm text-muted-foreground">Transparent pricing — what you see is what you pay, plus any shown travel fee.</p>
            {p.services.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                No services listed yet — check back soon.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {p.services.map((s) => (
                  <li key={s.id} className="card-rest p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold">{s.name}</h3>
                      <span className="font-bold tabular-nums">{formatPrice(s.price, s.currency)}</span>
                    </div>
                    {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                    <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                      <Badge>{s.durationMin} min</Badge>
                      {s.deliveryTypes.map((d) => (
                        <Badge key={d} variant="outline">{d.replace(/_/g, ' ').toLowerCase()}</Badge>
                      ))}
                      {s.travelFee != null && <Badge variant="info">travel {formatPrice(s.travelFee, s.currency)}</Badge>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button asChild size="sm">
                        <Link href={`/services/${s.id}`}>View &amp; book</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Portfolio */}
          {p.portfolio.length > 0 && (
            <section aria-labelledby="portfolio-h">
              <h2 id="portfolio-h" className="type-h2">Portfolio</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {p.portfolio.map((item) => (
                  <article key={item.id} className="card-rest p-4">
                    <h3 className="font-medium">{item.title}</h3>
                    {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                    {(item.images?.length ?? 0) > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.images!.map((img) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={img.key} src={img.url} alt={`${item.title} example`} className="h-20 w-20 rounded-md object-cover" loading="lazy" />
                        ))}
                      </div>
                    )}
                    {item.link && (
                      <a href={item.link} className="mt-2 inline-block text-sm text-primary hover:underline" target="_blank" rel="noreferrer">
                        View more
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          <section aria-labelledby="reviews-h">
            <h2 id="reviews-h" className="type-h2">Reviews</h2>
            <p className="mt-1 text-sm text-muted-foreground">Only customers with completed, verified appointments can leave a review.</p>
            {reviews.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                No verified reviews yet — be the first to book and review.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="card-rest p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Rating value={r.overall} showCount={false} />
                      <time className="text-xs text-muted-foreground" dateTime={r.createdAt}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </time>
                    </div>
                    {r.title && <p className="mt-1.5 font-medium">{r.title}</p>}
                    {r.body && <p className="mt-1 text-sm text-foreground/90">{r.body}</p>}
                    {r.dimensions.length > 0 && (
                      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                        {r.dimensions.map((d) => (
                          <div key={d.id} className="flex justify-between gap-2">
                            <dt>{d.name}</dt>
                            <dd className="font-medium text-foreground">{d.score}/5</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {r.response && (
                      <div className="mt-3 rounded-md bg-muted/60 p-3 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider response</p>
                        <p className="mt-1">{r.response.body}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Policies */}
          <section aria-labelledby="policies-h" className="rounded-xl border bg-muted/30 p-5">
            <h2 id="policies-h" className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Good to know</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li>· Cancellation policy is shown before you confirm each booking.</li>
              <li>· Payment is verified by the backend before a booking is confirmed.</li>
              <li>· Exact address &amp; contact details are shared inside the booking — never publicly.</li>
              {p.serviceRadiusKm != null && <li>· Serves within ~{p.serviceRadiusKm} km{p.travelToCustomer ? ' and travels to customers' : ''}.</li>}
            </ul>
          </section>
        </div>

        {/* Sticky booking rail (desktop) */}
        <aside className="lg:col-span-1" aria-label="Booking summary">
          <div className="card-elevated sticky top-20 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Starting from</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {lowest != null ? formatPrice(lowest, p.services[0]?.currency ?? 'KES') : 'See services'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{p.services.length} service{p.services.length === 1 ? '' : 's'} available</p>
            <Button asChild className="mt-4 min-h-[48px] w-full">
              <Link href="#book">Choose a service</Link>
            </Button>
            <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Response rate</dt><dd className="font-medium">{p.reviews.responseRate}%</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Completion</dt><dd className="font-medium">{p.reviews.completionRate}%</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Languages</dt><dd className="text-right font-medium">{p.languages.length > 0 ? p.languages.join(', ') : '—'}</dd></div>
            </dl>
          </div>
        </aside>
      </div>

      {/* Sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">From</p>
            <p className="font-bold tabular-nums">{lowest != null ? formatPrice(lowest, p.services[0]?.currency ?? 'KES') : 'See services'}</p>
          </div>
          <Button asChild className="min-h-[48px] flex-1">
            <Link href="#book">Book a service</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

function TrustMetric({ value, label, extra }: { value: string; label: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background p-3.5">
      <p className="text-lg font-bold leading-tight">{value}</p>
      {extra}
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}
