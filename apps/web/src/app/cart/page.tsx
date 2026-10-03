'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { formatMinorUnits } from '@/lib/format';
import { Breadcrumb } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CartItem {
  id: string;
  productId: string;
  productName: string | null;
  variantId: string | null;
  variantAttrs: Record<string, unknown> | null;
  qty: number;
  unitCents: string;
  lineCents: string;
  currency: string;
}

interface Cart {
  id: string;
  items: CartItem[];
  subtotalCents: string;
}

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState('MPESA');
  const [promoCode, setPromoCode] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const router = useRouter();

  async function refresh() {
    setLoading(true);
    const res = await apiClient.get<Cart>('/cart');
    if (res.error) setError(res.error.message);
    else {
      setCart(res.data as Cart);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setQty(id: string, qty: number) {
    if (qty <= 0) {
      const res = await apiClient.patch(`/cart/items/${id}`, { qty: 0 });
      if (!res.error) setCart((res.data as Cart) ?? null);
      return;
    }
    const res = await apiClient.patch(`/cart/items/${id}`, { qty });
    if (res.error) setError(res.error.message);
    else setCart((res.data as Cart) ?? null);
  }

  async function checkout() {
    setCheckingOut(true);
    setError(null);
    const res = await apiClient.post<{ order: { id: string } }>('/orders/checkout', {
      method,
      ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
    });
    setCheckingOut(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push(`/orders?highlight=${(res.data as { order: { id: string } }).order.id}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Products', href: '/products' }, { label: 'Cart' }]} />
      <h1 className="type-h1 mt-3">Your cart</h1>

      {loading && <div className="mt-6"><ListSkeleton rows={3} /></div>}
      {error && !loading && <div className="mt-6"><ErrorState description={error} onRetry={refresh} /></div>}

      {!loading && !error && (!cart || cart.items.length === 0) && (
        <div className="mt-6">
          <EmptyState
            title="Your cart is empty"
            description="Add professional-recommended products — they check out separately from service bookings."
            actionLabel="Browse beauty products"
            actionHref="/products"
          />
        </div>
      )}

      {!loading && cart && cart.items.length > 0 && (
        <div className="mt-6">
          <ul className="space-y-3">
            {cart.items.map((i) => (
              <li key={i.id} className="card-rest flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.productName ?? i.productId.slice(0, 8)}</p>
                  {i.variantAttrs && (
                    <p className="text-xs text-muted-foreground">
                      {Object.entries(i.variantAttrs).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{formatMinorUnits(i.unitCents, i.currency)} each</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="sr-only" htmlFor={`qty-${i.id}`}>Quantity for {i.productName ?? 'product'}</label>
                  <Input
                    id={`qty-${i.id}`}
                    type="number" min={0} max={99}
                    value={i.qty}
                    onChange={(e) => setQty(i.id, Number(e.target.value))}
                    className="h-11 w-[72px]"
                  />
                  <p className="w-24 text-right font-bold tabular-nums">{formatMinorUnits(i.lineCents, i.currency)}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="card-rest mt-4 space-y-2 p-5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Products subtotal</span><span className="font-bold">{formatMinorUnits(cart.subtotalCents, 'KES')}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>Calculated at checkout</span></div>
            <div className="flex justify-between border-t pt-2 text-base"><span className="font-semibold">Total</span><span className="font-bold">{formatMinorUnits(cart.subtotalCents, 'KES')}</span></div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Payment</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-12 rounded-md border border-input bg-background px-3">
                <option value="MPESA">M-Pesa</option>
                <option value="CARD">Card</option>
                <option value="BANK">Bank</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Promo code <span className="font-normal text-muted-foreground">(optional)</span></span>
              <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="SAVE10" className="h-12 uppercase" />
            </label>
            <div className="flex items-end">
              <Button onClick={checkout} disabled={checkingOut} className="h-12 w-full sm:w-auto sm:px-8">
                {checkingOut ? 'Placing order…' : 'Checkout'}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Orders are paid and fulfilled separately from service bookings. Payment status is backend-verified.</p>
          <p className="mt-2 text-sm"><Link href="/checkout" className="text-primary hover:underline">Go to secure checkout →</Link></p>
        </div>
      )}
    </main>
  );
}
