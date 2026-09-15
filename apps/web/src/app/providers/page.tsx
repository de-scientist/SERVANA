import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchProviders, formatPrice } from '@/lib/server-api';

export const metadata: Metadata = {
  title: 'Find Verified Beauty & Personal-Care Providers | SERVANA',
  description:
    'Browse verified beauty and personal-care providers, their services, portfolios and coverage areas on SERVANA.',
  alternates: { canonical: '/providers' },
  openGraph: {
    title: 'Verified Providers on SERVANA',
    description: 'Discover and book trusted beauty & personal-care professionals near you.',
    type: 'website',
  },
};

export default async function ProvidersPage() {
  const { data: providers, meta } = await fetchProviders();

  return (
    <main className="container py-10">
      <header className="mb-8">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Phase 3 · Provider Marketplace
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Verified Providers</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Discover trusted beauty &amp; personal-care professionals. Browse services, portfolios and coverage areas,
          then book directly.
        </p>
      </header>

      {providers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No providers are publicly listed yet. Providers appear here once they are verified.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <Link
              key={p.id}
              href={`/providers/${p.slug}`}
              className="flex flex-col rounded-lg border bg-card p-5 shadow-soft transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{p.businessName}</h2>
                {p.verified && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Verified
                  </span>
                )}
              </div>
              {p.tagline && <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.categories.map((c) => (
                  <span key={c.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {c.name}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between pt-4 text-sm">
                <span className="text-muted-foreground">{p.city ?? '—'}</span>
                <span className="font-medium">
                  {p.fromPrice != null ? `from ${formatPrice(p.fromPrice)}` : `${p.serviceCount} services`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {meta.pages > 1 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Showing {providers.length} of {meta.total} providers
        </p>
      )}
    </main>
  );
}
