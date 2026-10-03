import { notFound } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { StatusBadge } from '@/components/ui/status-badge';
import { Breadcrumb } from '@/components/ui/tabs';
import { formatMinorUnits } from '@/lib/format';

interface OrderDetail {
  id: string;
  status: string;
  totalCents: string;
  currency: string;
  items: { id: string; productName: string | null; qty: number; unitCents: string }[];
  payment: { id: string; status: string } | null;
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const cookie = headers().get('cookie') ?? '';
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  let order: OrderDetail | null = null;
  try {
    const res = await fetch(`${base}/api/v1/orders/${encodeURIComponent(params.id)}`, { headers: { cookie }, cache: 'no-store' });
    if (res.ok) order = ((await res.json()) as { data: OrderDetail }).data;
  } catch {
    order = null;
  }
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My orders', href: '/orders' }, { label: order.id.slice(0, 8) }]} />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="type-h2">Order {order.id.slice(0, 8)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.payment ? <>Payment (backend-verified): <strong>{order.payment.status}</strong></> : 'Payment pending — complete your M-Pesa prompt.'}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <section className="card-rest mt-4 p-5" aria-label="Order summary">
        <ul className="space-y-2 text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span>{i.qty} × {i.productName ?? 'Product'}</span>
              <span className="tabular-nums">{formatMinorUnits(i.unitCents, order!.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3">
          <span className="font-semibold">Total</span>
          <span className="font-bold tabular-nums">{formatMinorUnits(order.totalCents, order.currency)}</span>
        </div>
      </section>
      <Link href="/orders" className="mt-4 inline-block text-sm text-primary hover:underline">← All orders</Link>
    </main>
  );
}
