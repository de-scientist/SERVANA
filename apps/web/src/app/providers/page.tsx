import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchProviders } from '@/lib/server-api';
import { ProviderCard } from '@/components/marketplace/provider-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumb } from '@/components/ui/tabs';

export const metadata: Metadata = {
  title: 'Find Verified Beauty & Personal-Care Providers',
  description: 'Browse verified beauty and personal-care providers, their services, portfolios and coverage areas on SERVANA.',
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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Providers' }]} />
      <header className="mt-3 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Verified marketplace</p>
        <h1 className="type-h1 mt-1">Verified providers</h1>
        <p className="mt-2 text-muted-foreground">
          Trusted beauty &amp; personal-care professionals. Compare services, transparent starting
          prices and coverage — then book directly.
        </p>
      </header>

      {providers.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No providers are publicly listed yet"
            description="Providers appear here once they complete verification. New professionals join every week."
            actionLabel="Search services"
            actionHref="/search"
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} fromPrice={p.fromPrice} />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {meta.pages > 1 ? (
          <>Showing {providers.length} of {meta.total} providers · <Link href="/search" className="text-primary hover:underline">Refine with search</Link></>
        ) : providers.length > 0 ? (
          <>Showing all {providers.length} verified providers</>
        ) : null}
      </p>
    </main>
  );
}
