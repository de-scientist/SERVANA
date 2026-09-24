import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchProduct } from '@/lib/shop-api';
import { formatPrice } from '@/lib/server-api';
import AddToCart from '@/components/AddToCart';

export default async function ProductPage({ params }: { params: { id: string } }) {
  const p = await fetchProduct(params.id);
  if (!p) notFound();

  const available = p.inventory.reduce((s, r) => s + Math.max(0, r.available), 0);

  return (
    <main className="container py-10">
      <Link href="/products" className="text-sm text-primary hover:underline">
        ← All products
      </Link>
      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
          {p.brand && <p className="mt-1 text-muted-foreground">{p.brand}</p>}
          <p className="mt-3 text-2xl font-bold">
            {formatPrice(p.effectivePrice, p.currency)}
            {p.salePrice != null && (
              <span className="ml-2 text-base font-normal text-muted-foreground line-through">
                {formatPrice(p.price, p.currency)}
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {available > 0 ? `${available} in stock` : 'Out of stock'}
          </p>
          {available > 0 && <AddToCart productId={p.id} variants={p.variants} />}
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Details</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between border-b py-1.5">
              <dt className="text-muted-foreground">SKU</dt>
              <dd>{p.sku}</dd>
            </div>
            {p.variants.map((v) => (
              <div key={v.id} className="flex justify-between border-b py-1.5">
                <dt className="text-muted-foreground">
                  {Object.entries(v.attrs).map(([k, val]) => `${k}: ${String(val)}`).join(', ')}
                </dt>
                <dd>{v.priceDelta !== 0 ? `${v.priceDelta > 0 ? '+' : ''}${formatPrice(v.priceDelta, p.currency)}` : '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </main>
  );
}
