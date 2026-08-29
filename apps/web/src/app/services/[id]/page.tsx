import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchService, formatPrice } from '@/lib/server-api';
import AvailabilityPicker from '@/components/AvailabilityPicker';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const s = await fetchService(params.id);
  if (!s) return { title: 'Service not found | SERVANA' };
  const title = `${s.name} by ${s.provider.businessName} | SERVANA`;
  const description = s.description ?? `Book ${s.name} on SERVANA.`;
  return {
    title,
    description,
    alternates: { canonical: `/services/${s.id}` },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function ServicePage({ params }: PageProps) {
  const s = await fetchService(params.id);
  if (!s) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s.name,
    description: s.description,
    provider: {
      '@type': 'LocalBusiness',
      name: s.provider.businessName,
      areaServed: s.provider.city,
    },
    offers: {
      '@type': 'Offer',
      price: s.price,
      priceCurrency: s.currency,
    },
  };

  return (
    <main className="container py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/search" className="text-sm text-primary hover:underline">
        ← Back to search
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {s.provider.verified && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                Verified {s.provider.verificationLevel?.replace('_', ' ').toLowerCase()}
              </span>
            )}
            <Link href={`/providers/${s.provider.slug}`} className="text-sm text-muted-foreground hover:underline">
              {s.provider.businessName}
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{s.name}</h1>
          {s.description && <p className="mt-3 max-w-2xl leading-relaxed text-foreground/90">{s.description}</p>}

          <div className="mt-4 flex flex-wrap gap-1.5 text-sm text-muted-foreground">
            <span className="rounded bg-muted px-2 py-0.5">{s.durationMin} min</span>
            {s.deliveryTypes.map((d) => (
              <span key={d} className="rounded bg-muted px-2 py-0.5">{d.replace(/_/g, ' ').toLowerCase()}</span>
            ))}
            {s.provider.city && <span className="rounded bg-muted px-2 py-0.5">{s.provider.city}</span>}
          </div>

          {s.images && s.images.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {s.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.key} src={img.url} alt={s.name} className="h-40 w-full rounded-lg object-cover" />
              ))}
            </div>
          )}

          <section className="mt-8 rounded-lg border bg-card p-5">
            <AvailabilityPicker slug={s.provider.slug} serviceId={s.id} />
          </section>
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-6 rounded-lg border bg-card p-5 shadow-soft">
            <p className="text-2xl font-bold">{formatPrice(s.price, s.currency)}</p>
            {s.travelFee != null && (
              <p className="mt-1 text-sm text-muted-foreground">+ travel {formatPrice(s.travelFee, s.currency)}</p>
            )}
            <Link
              href="#"
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Book (coming soon)
            </Link>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Booking engine launches next. Slots above are generated dynamically.
            </p>

            <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Duration</dt>
                <dd>{s.durationMin} min</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Buffer</dt>
                <dd>{s.bufferMin} min</dd>
              </div>
              {s.bookingWindowDays != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Book up to</dt>
                  <dd>{s.bookingWindowDays} days ahead</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Provider</dt>
                <dd>
                  <Link href={`/providers/${s.provider.slug}`} className="text-primary hover:underline">
                    {s.provider.businessName}
                  </Link>
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </main>
  );
}
