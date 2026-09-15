'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

const VIEWS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

type View = (typeof VIEWS)[number]['key'];

interface Booking {
  id: string;
  reference: string;
  status: string;
  startsAt: string;
  priceCents: bigint;
  currency: string;
  service: { title: string };
  provider: { businessName: string; slug: string };
}

export default function CustomerBookingsPage() {
  const [view, setView] = useState<View>('upcoming');
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<{ data: Booking[] }>(`/bookings?view=${view}`)
      .then((res) => {
        if (res.error) {
          setError(res.error.message);
          setItems([]);
        } else {
          setItems((res.data as any) ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [view]);

  async function cancel(id: string) {
    if (!confirm('Cancel this booking?')) return;
    await apiClient.post(`/bookings/${id}/cancel`, { reason: 'Customer request' });
    setItems((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">My bookings</h1>
      <div className="mt-4 flex gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              view === v.key ? 'bg-primary text-primary-foreground' : 'border bg-background'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {loading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No bookings here.{' '}
          <Link href="/search" className="text-primary underline">
            Find a service
          </Link>
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {items.map((b) => (
          <li key={b.id} className="rounded-lg border bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{b.service.title}</p>
                <Link href={`/providers/${b.provider.slug}`} className="text-sm text-muted-foreground hover:underline">
                  {b.provider.businessName}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(b.startsAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{b.status}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-semibold">{(Number(b.priceCents) / 100).toFixed(2)} {b.currency}</span>
              {['PENDING', 'CONFIRMED'].includes(b.status) && (
                <button onClick={() => cancel(b.id)} className="text-sm font-medium text-red-600 hover:underline">
                  Cancel
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
