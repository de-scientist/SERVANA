'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

interface OrderItem {
  id: string;
  productName: string | null;
  qty: number;
  unitCents: string;
}

interface Order {
  id: string;
  status: string;
  totalCents: string;
  currency: string;
  items: OrderItem[];
  payment: { id: string; status: string } | null;
}

export default function OrdersPage({ searchParams }: { searchParams: { highlight?: string } }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ data: Order[] }>('/orders')
      .then((res) => {
        if (res.error) setError(res.error.message);
        else setOrders(((res.data as unknown) as { data: Order[] }).data ?? (res.data as unknown as Order[]));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="container py-10"><p className="text-sm text-muted-foreground">Loading orders…</p></main>;

  return (
    <main className="container py-10">
      <h1 className="text-3xl font-bold tracking-tight">Your orders</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {searchParams.highlight && (
        <p className="mt-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm">
          Order placed! Complete payment from your M-Pesa prompt — your order will confirm automatically.
        </p>
      )}
      {orders.length === 0 && !error ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No orders yet. <Link href="/products" className="text-primary hover:underline">Shop beauty products</Link>.
        </p>
      ) : (
        <ul className="mt-6 max-w-2xl space-y-4">
          {orders.map((o) => (
            <li
              key={o.id}
              className={`rounded-lg border bg-card p-4 ${searchParams.highlight === o.id ? 'border-primary' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{formatPrice(o.totalCents, o.currency)}</p>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{o.status}</span>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {o.items.map((i) => (
                  <li key={i.id}>
                    {i.qty} × {i.productName ?? 'Product'} — {formatPrice(i.unitCents, o.currency)}
                  </li>
                ))}
              </ul>
              {o.payment && <p className="mt-2 text-xs text-muted-foreground">Payment: {o.payment.status}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
