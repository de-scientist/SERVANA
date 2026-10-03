import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchProduct, fetchProducts } from '@/lib/shop-api';
import AddToCart from '@/components/AddToCart';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { Breadcrumb, SectionHeading } from '@/components/ui/tabs';
import { ProductCard } from '@/components/marketplace/product-card';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const p = await fetchProduct(params.id).catch(() => null);
  if (!p) return { title: 'Product not found' };
  const title = `${p.name}${p.brand ? ` by ${p.brand}` : ''}`;
  return {
    title,
    description: `Shop ${title} on SERVANA.`,
    alternates: { canonical: `/products/${p.id}` },
    openGraph: { title, description: `Shop ${title} on SERVANA.`, type: 'website' },
  };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const p = await fetchProduct(params.id).catch(() => null);
  if (!p) notFound();

  const available = p.inventory.reduce((s, r) => s + Math.max(0, r.available), 0);
  const onSale = p.salePrice != null && p.salePrice < p.price;
  const related = (await fetchProducts().catch(() => [])).filter((x) => x.id !== p.id && x.categoryId === p.categoryId).slice(0, 3);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Products', href: '/products' }, { label: p.name }]} />
      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border bg-muted/50">
          <div className="flex h-72 items-center justify-center text-6xl font-extrabold text-muted-foreground" aria-label={`${p.name} image placeholder`}>
            {(p.brand ?? p.name).charAt(0).toUpperCase()}
          </div>
        </div>
        <div>
          {p.brand && <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{p.brand}</p>}
          <h1 className="type-h1 mt-1">{p.name}</h1>
          <p className="mt-3 flex items-baseline gap-2 text-2xl">
            <Price minorUnits={p.effectiveCents} currency={p.currency} className="text-2xl" />
            {onSale && <Price major={p.price} currency={p.currency} strike />}
            {onSale && <Badge variant="danger">Sale</Badge>}
          </p>
          <p className="mt-1.5 text-sm" role="status">
            {available > 0 ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-300">{available} in stock</span>
            ) : (
              <span className="font-medium text-destructive">Out of stock</span>
            )}
          </p>
          {available > 0 && <AddToCart productId={p.id} variants={p.variants} />}
          <dl className="mt-6 space-y-2 rounded-xl border bg-card p-4 text-sm">
            <div className="flex justify-between border-b pb-2"><dt className="text-muted-foreground">SKU</dt><dd className="font-mono">{p.sku}</dd></div>
            <div className="flex justify-between border-b pb-2"><dt className="text-muted-foreground">Status</dt><dd>{p.status.replace(/_/g, ' ')}</dd></div>
            {p.variants.map((v) => (
              <div key={v.id} className="flex justify-between border-b pb-2 last:border-0 last:pb-0">
                <dt className="text-muted-foreground">{Object.entries(v.attrs).map(([k, val]) => `${k}: ${String(val)}`).join(', ')}</dt>
                <dd>{v.priceDelta !== 0 ? `${v.priceDelta > 0 ? '+' : ''}${p.currency} ${v.priceDelta.toLocaleString('en-KE')}` : '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12" aria-labelledby="related-h">
          <div id="related-h">
            <SectionHeading title="Related products" description="More from this category." />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <ProductCard key={r.id} product={r} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-8 text-sm">
        <Link href="/products" className="text-primary hover:underline">← All products</Link>
      </p>
    </main>
  );
}
