'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

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
    const res = await apiClient.get<Cart>('/cart');
    if (res.error) setError(res.error.message);
    else setCart(res.data as Cart);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function setQty(id: string, qty: number) {
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

  if (loading) return <main className="container py-10"><p className="text-sm text-muted-foreground">Loading cart…</p></main>;

  return (
    <main className="container py-10">
      <h1 className="text-3xl font-bold tracking-tight">Your cart</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!cart || cart.items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Your cart is empty. <Link href="/products" className="text-primary hover:underline">Browse beauty products</Link>.
        </p>
      ) : (
        <div className="mt-6 max-w-2xl">
          <ul className="space-y-3">
            {cart.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div>
                  <p className="font-medium">{i.productName ?? i.productId.slice(0, 8)}</p>
                  {i.variantAttrs && (
                    <p className="text-xs text-muted-foreground">
                      {Object.entries(i.variantAttrs).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{formatPrice(i.unitCents, i.currency)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={i.qty}
                    onChange={(e) => setQty(i.id, Number(e.target.value))}
                    className="h-9 w-16 rounded-md border px-2 text-sm"
                  />
                  <p className="w-24 text-right font-semibold">{formatPrice(i.lineCents, i.currency)}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <p className="font-semibold">Subtotal</p>
            <p className="text-xl font-bold">{formatPrice(cart.subtotalCents, 'KES')}</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-md border px-3 text-sm">
              <option value="MPESA">M-Pesa</option>
              <option value="CARD">Card</option>
              <option value="BANK">Bank</option>
              <option value="OTHER">Other</option>
            </select>
            <button
              onClick={checkout}
              disabled={checkingOut}
              className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {checkingOut ? 'Placing order…' : 'Checkout'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
