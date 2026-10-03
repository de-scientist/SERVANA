import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import type { ShopProduct } from '@/lib/shop-api';

/** Product card — visually distinct from service booking cards. */
export function ProductCard({ product }: { product: ShopProduct }) {
  const available = product.inventory.reduce((s, r) => s + Math.max(0, r.available), 0);
  const onSale = product.salePrice != null && product.salePrice < product.price;
  return (
    <article className="card-rest flex h-full flex-col overflow-hidden transition-micro hover:border-primary/50 hover:shadow-md">
      <div className="flex h-32 items-center justify-center bg-muted/60 text-3xl font-bold text-muted-foreground" aria-hidden>
        {(product.brand ?? product.name).charAt(0).toUpperCase()}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-snug">
            <Link href={`/products/${product.id}`} className="hover:text-primary hover:underline">
              {product.name}
            </Link>
          </h3>
          {onSale && <Badge variant="danger">Sale</Badge>}
        </div>
        {product.brand && <p className="mt-0.5 text-xs text-muted-foreground">{product.brand}</p>}
        <p className="mt-2 flex items-baseline gap-2">
          <Price minorUnits={product.effectiveCents} currency={product.currency} />
          {onSale && <Price major={product.price} currency={product.currency} strike />}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {available > 0 ? `${available} in stock` : 'Out of stock'}
          {product.variants.length > 0 ? ` · ${product.variants.length} options` : ''}
        </p>
        <Link
          href={`/products/${product.id}`}
          className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-micro hover:opacity-90"
        >
          View product
        </Link>
      </div>
    </article>
  );
}
