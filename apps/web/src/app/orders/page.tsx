'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { formatMinorUnits } from '@/lib/format';
import { Breadcrumb, Tabs } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';

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

  async function load() {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<{ data: Order[] } | Order[]>('/orders');
    if (res.error) setError(res.error.message);
    else {
      const raw = res.data as { data: Order[] } | Order[] | null;
      setOrders(Array.isArray(raw) ? raw : (raw?.data ?? []));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My orders' }]} />
      <h1 className="type-h1 mt-3">Your orders</h1>
      {searchParams.highlight && (
        <p className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm dark:bg-emerald-900/20" role="status">
          Order placed! Complete payment from your M-Pesa prompt — your order confirms automatically once the backend verifies it.
        </p>
      )}
      {loading && <div className="mt-6"><ListSkeleton rows={3} /></div>}
      {error && !loading && <div className="mt-6"><ErrorState description={error} onRetry={load} /></div>}
      {!loading && !error && orders.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No orders yet"
            description="Shop professional-recommended products — orders appear here with live payment status."
            actionLabel="Shop beauty products"
            actionHref="/products"
          />
        </div>
      )}
      <ul className="mt-6 space-y-3">
        {orders.map((o) => (
          <li key={o.id} className={`card-rest p-4 ${searchParams.highlight === o.id ? 'border-primary' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold tabular-nums">{formatMinorUnits(o.totalCents, o.currency)}</p>
              <StatusBadge status={o.status} />
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {o.items.map((i) => (
                <li key={i.id}>{i.qty} × {i.productName ?? 'Product'} — {formatMinorUnits(i.unitCents, o.currency)}</li>
              ))}
            </ul>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-sm">
              <span className="text-xs text-muted-foreground">
                {o.payment ? <>Payment (verified): <strong>{o.payment.status}</strong></> : 'Payment pending'}
              </span>
              <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">View order</Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function OrderTabsPlaceholder() {
  return <Tabs options={[{ key: 'all', label: 'All' }]} value="all" onChange={() => undefined} label="Orders" />;
}
