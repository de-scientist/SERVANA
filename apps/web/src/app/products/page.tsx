import Link from 'next/link';
import { fetchProducts } from '@/lib/shop-api';
import { formatPrice } from '@/lib/server-api';

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string } }) {
  const products = await fetchProducts(searchParams.q);

  return (
    <main className="container py-10">
      <h1 className="text-3xl font-bold tracking-tight">Shop beauty products</h1>
      <form method="get" className="mt-4 flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="Search oils, creams, tools…"
          className="h-10 flex-1 rounded-md border px-3 text-sm"
        />
        <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Search
        </button>
      </form>

      {products.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No products found. Try a different search — new beauty essentials land here regularly.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const available = p.inventory.reduce((s, r) => s + Math.max(0, r.available), 0);
            return (
              <Link key={p.id} href={`/products/${p.id}`} className="rounded-lg border bg-card p-4 shadow-soft hover:border-primary">
                <h2 className="font-medium">{p.name}</h2>
                {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                <p className="mt-2 font-semibold">
                  {formatPrice(p.effectivePrice, p.currency)}
                  {p.salePrice != null && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground line-through">
                      {formatPrice(p.price, p.currency)}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {available > 0 ? `${available} in stock` : 'Out of stock'}
                  {p.variants.length > 0 ? ` · ${p.variants.length} options` : ''}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
