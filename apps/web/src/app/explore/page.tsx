import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBar } from '@/components/ui/search-bar';
import { CategoryGrid } from '@/components/marketplace/category-grid';
import { SectionHeading } from '@/components/ui/tabs';
import { Breadcrumb } from '@/components/ui/tabs';

export const metadata: Metadata = {
  title: 'Explore Beauty & Personal-Care Services',
  description: 'Browse categories, search naturally and compare verified providers across hair, makeup, nails, barber, skincare and massage.',
  alternates: { canonical: '/explore' },
};

const GUIDES = [
  { q: 'Makeup artist near me', href: '/search?q=makeup' },
  { q: 'Barber tomorrow', href: '/search?q=barber' },
  { q: 'Nails under KSh 2,000', href: '/search?q=nails' },
  { q: 'Hair stylist in Nairobi', href: '/search?city=Nairobi' },
];

export default function ExplorePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Explore' }]} />
      <h1 className="type-h1 mt-3">Explore the marketplace</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Search naturally — the marketplace understands services, places, budgets and timing.
      </p>
      <div className="mt-5 max-w-2xl">
        <SearchBar />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Example searches">
        {GUIDES.map((g) => (
          <Link
            key={g.q}
            href={g.href}
            className="rounded-full border bg-card px-3 py-1.5 font-medium transition-micro hover:border-primary hover:text-primary"
          >
            “{g.q}”
          </Link>
        ))}
      </div>

      <section className="mt-10" aria-labelledby="explore-cats">
        <div id="explore-cats">
          <SectionHeading title="Browse by category" description="Start with what you need — refine by price, rating and availability." />
        </div>
        <div className="mt-5">
          <CategoryGrid />
        </div>
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-3" aria-label="Discovery shortcuts">
        {[
          { title: 'All providers', text: 'Compare verified professionals.', href: '/providers' },
          { title: 'Search services', text: 'Filter by price, city & rating.', href: '/search' },
          { title: 'Shop products', text: 'Aftercare & beauty essentials.', href: '/products' },
        ].map((c) => (
          <Link key={c.title} href={c.href} className="card-rest p-5 transition-micro hover:border-primary/50 hover:shadow-md">
            <p className="font-semibold">{c.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
