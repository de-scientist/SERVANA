import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BadgeCheck, Clock, MapPin } from 'lucide-react';
import { fetchService } from '@/lib/server-api';
import { fetchCrossSell } from '@/lib/shop-api';
import AvailabilityPicker from '@/components/AvailabilityPicker';
import BookServicePanel from '@/components/BookServicePanel';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { Breadcrumb } from '@/components/ui/tabs';
import { ProductCard } from '@/components/marketplace/product-card';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const s = await fetchService(params.id);
  if (!s) return { title: 'Service not found' };
  const title = `${s.name} by ${s.provider.businessName ?? 'Verified provider'}`;
  const description = s.description ?? `Book ${s.name} on SERVANA — ${s.durationMin} min, transparent pricing.`;
  return {
    title,
    description,
    alternates: { canonical: `/services/${s.id}` },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function ServicePage({ params }: PageProps) {
  const s = await fetchService(params.id);
  if (!s) notFound();
  const crossSell = await fetchCrossSell(s.id);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s.name,
    description: s.description,
    provider: { '@type': 'LocalBusiness', name: s.provider.businessName, areaServed: s.provider.city },
    offers: { '@type': 'Offer', price: s.price, priceCurrency: s.currency },
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-28 lg:pb-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') }} />
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Search', href: '/search' }, { label: s.name }]} />

      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {s.provider.verified && (
              <Badge variant="success" className="gap-1">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                ✓ Verified {(s.provider.verificationLevel ?? '').replace(/_/g, ' ').toLowerCase()}
              </Badge>
            )}
            <Link href={`/providers/${s.provider.slug}`} className="font-medium text-primary hover:underline">
              {s.provider.businessName}
            </Link>
          </div>
          <h1 className="type-h1 mt-2">{s.name}</h1>
          {s.description && <p className="type-body-lg mt-3 max-w-2xl text-foreground/90">{s.description}</p>}

          <div className="mt-4 flex flex-wrap gap-1.5 text-sm">
            <Badge><Clock className="h-3 w-3" aria-hidden /> {s.durationMin} min</Badge>
            {s.deliveryTypes.map((d) => (
              <Badge key={d} variant="outline">{d.replace(/_/g, ' ').toLowerCase()}</Badge>
            ))}
            {s.provider.city && <Badge variant="outline"><MapPin className="h-3 w-3" aria-hidden /> {s.provider.city}</Badge>}
          </div>

          {s.images && s.images.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" role="list" aria-label="Service images">
              {s.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.key} src={img.url} alt={`${s.name} example`} className="h-40 w-full rounded-xl object-cover" loading="lazy" />
              ))}
            </div>
          )}

          <section className="mt-8 rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="avail-h">
            <h2 id="avail-h" className="type-h3">Check availability</h2>
            <p className="mt-1 text-sm text-muted-foreground">Live slots from the provider&apos;s real calendar — unavailable times can&apos;t be selected.</p>
            <div className="mt-4">
              <AvailabilityPicker slug={s.provider.slug} serviceId={s.id} />
            </div>
          </section>

          {/* What's included / policies */}
          <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Service details">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">What&apos;s included</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>· {s.durationMin}-minute professional service</li>
                <li>· {s.deliveryTypes.map((d) => d.replace(/_/g, ' ').toLowerCase()).join(' / ') || 'In-person service'}</li>
                {s.bufferMin > 0 && <li>· {s.bufferMin}-minute preparation buffer for quality</li>}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Cancellation &amp; payment</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>· Cancellation window shown before you confirm.</li>
                {s.bookingWindowDays != null && <li>· Book up to {s.bookingWindowDays} days ahead.</li>}
                <li>· Payment verified by backend before confirmation.</li>
              </ul>
            </div>
          </section>

          {crossSell.length > 0 && (
            <section className="mt-8" aria-labelledby="aftercare-h">
              <h2 id="aftercare-h" className="type-h3">Recommended aftercare</h2>
              <p className="mt-1 text-sm text-muted-foreground">Products that pair well with this service.</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {crossSell.slice(0, 4).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:col-span-1" aria-label="Booking panel">
          <div className="lg:sticky lg:top-20">
            <div className="card-elevated p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total price</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                <Price major={s.price} currency={s.currency} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">No hidden fees — full breakdown before payment.</p>
              <div className="mt-4">
                <BookServicePanel
                  serviceId={s.id}
                  slug={s.provider.slug}
                  deliveryTypes={s.deliveryTypes}
                  priceLabel={`${s.currency} ${s.price.toLocaleString('en-KE')}`}
                  providerCity={s.provider.city}
                />
              </div>
              <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Duration</dt><dd className="font-medium">{s.durationMin} min</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Provider</dt><dd><Link href={`/providers/${s.provider.slug}`} className="font-medium text-primary hover:underline">{s.provider.businessName}</Link></dd></div>
              </dl>
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky mobile booking bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Price major={s.price} currency={s.currency} className="text-lg" />
          <Link href="#book" onClick={(e) => { e.preventDefault(); document.getElementById('book-panel')?.scrollIntoView({ behavior: 'smooth' }); }} className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-primary font-medium text-primary-foreground">
            Book now
          </Link>
        </div>
      </div>
      <span id="book-panel" className="scroll-mt-24" />
    </main>
  );
}
