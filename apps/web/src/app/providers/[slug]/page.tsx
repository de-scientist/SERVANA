import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchProvider, formatPrice } from '@/lib/server-api';

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const p = await fetchProvider(params.slug);
  if (!p) return { title: 'Provider not found | SERVANA' };
  const title = `${p.businessName} | SERVANA`;
  const description = p.tagline ?? p.bio ?? `Book ${p.businessName} on SERVANA.`;
  return {
    title,
    description,
    alternates: { canonical: `/providers/${p.slug}` },
    openGraph: {
      title,
      description,
      url: `/providers/${p.slug}`,
      type: 'profile',
    },
  };
}

export default async function ProviderPage({ params }: PageProps) {
  const p = await fetchProvider(params.slug);
  if (!p) notFound();

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

  return (
    <main className="container py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/providers" className="text-sm text-primary hover:underline">
        ← All providers
      </Link>

      <header className="mt-4 flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{p.businessName}</h1>
            {p.verification.verified && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                Verified {p.verification.level?.replace('_', ' ').toLowerCase()}
              </span>
            )}
          </div>
          {p.tagline && <p className="mt-1 text-muted-foreground">{p.tagline}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.categories.map((c) => (
              <span key={c.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {c.name}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {[p.city, p.country].filter(Boolean).join(', ')}
            {p.travelToCustomer ? ' · Travels to you' : ''}
          </p>
        </div>

        <div id="book" className="shrink-0">
          <Link
            href="#book"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Book this provider
          </Link>
          <p className="mt-2 text-center text-xs text-muted-foreground">Online booking opens soon</p>
        </div>
      </header>

      {p.bio && <p className="mt-6 max-w-3xl leading-relaxed text-foreground/90">{p.bio}</p>}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Services</h2>
        {p.services.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No services listed yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {p.services.map((s) => (
              <div key={s.id} className="rounded-lg border bg-card p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium">{s.name}</h3>
                  <span className="font-semibold">{formatPrice(s.price, s.currency)}</span>
                </div>
                {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-2 py-0.5">{s.durationMin} min</span>
                  {s.deliveryTypes.map((d) => (
                    <span key={d} className="rounded bg-muted px-2 py-0.5">
                      {d.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  ))}
                  {s.travelFee != null && <span className="rounded bg-muted px-2 py-0.5">travel {formatPrice(s.travelFee, s.currency)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {p.portfolio.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Portfolio</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {p.portfolio.map((item) => (
              <div key={item.id} className="rounded-lg border bg-card p-4 shadow-soft">
                <h3 className="font-medium">{item.title}</h3>
                {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                {(item.images?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.images!.map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={img.key} src={img.url} alt={item.title} className="h-20 w-20 rounded object-cover" />
                    ))}
                  </div>
                )}
                {item.link && (
                  <a href={item.link} className="mt-2 inline-block text-xs text-primary hover:underline" target="_blank" rel="noreferrer">
                    View more
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 rounded-lg border bg-muted/30 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reviews &amp; availability</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ratings and live availability will appear here once the booking engine launches. Reviews are only published
          after completed, verified appointments.
        </p>
        <div id="reviews" className="mt-3" />
        <div id="availability" className="mt-2" />
      </section>
    </main>
  );
}
