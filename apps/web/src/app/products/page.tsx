import type { Metadata } from 'next';
import { fetchProducts } from '@/lib/shop-api';
import { ProductCard } from '@/components/marketplace/product-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumb, SectionHeading } from '@/components/ui/tabs';
import { SearchBar } from '@/components/ui/search-bar';

export const metadata: Metadata = {
  title: 'Shop Beauty Products',
  description: 'Shop professional-recommended beauty products — hair, skincare, makeup, nails and tools.',
  alternates: { canonical: '/products' },
};

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string } }) {
  const products = await fetchProducts(searchParams.q).catch(() => []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Products' }]} />
      <div className="mt-3">
        <SectionHeading
          eyebrow="Shop"
          title="Beauty products"
          description="Professional-recommended essentials. Product orders check out separately from service bookings."
        />
      </div>
      <div className="mt-5 max-w-xl">
        <SearchBar defaultValue={searchParams.q} action="/products" placeholder="Search oils, creams, tools…" />
      </div>

      {products.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={searchParams.q ? `No products for “${searchParams.q}”` : 'No products yet'}
            description="Try a different search — new beauty essentials land here regularly."
            actionLabel="Explore services"
            actionHref="/search"
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
