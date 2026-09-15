'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

const VIEWS = [
  { key: 'pending', label: 'Pending' },
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
  customer: { fullName: string };
}

const ACTIONS: Record<string, { label: string; path: string; kind: 'primary' | 'danger' | 'ghost' }[]> = {
  PENDING: [
    { label: 'Confirm', path: '/confirm', kind: 'primary' },
    { label: 'Decline', path: '/decline', kind: 'danger' },
  ],
  CONFIRMED: [
    { label: 'Start', path: '/start', kind: 'primary' },
    { label: 'Cancel', path: '/cancel', kind: 'danger' },
  ],
  IN_PROGRESS: [
    { label: 'Complete', path: '/complete', kind: 'primary' },
    { label: 'Cancel', path: '/cancel', kind: 'danger' },
  ],
};

export default function ProviderBookingsPage() {
  const [view, setView] = useState<View>('pending');
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<{ data: Booking[] }>(`/bookings/provider?view=${view}`)
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

  async function act(b: Booking, path: string) {
    await apiClient.post(`/bookings/provider/${b.id}${path}`, {});
    setItems((prev) => prev.filter((x) => x.id !== b.id));
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Bookings</h1>
      <div className="mt-4 flex flex-wrap gap-2">
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
        <p className="mt-6 text-sm text-muted-foreground">No bookings in this view.</p>
      )}

      <ul className="mt-6 space-y-3">
        {items.map((b) => (
          <li key={b.id} className="rounded-lg border bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{b.service.title}</p>
                <p className="text-sm text-muted-foreground">{b.customer.fullName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(b.startsAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{b.status}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-semibold">{(Number(b.priceCents) / 100).toFixed(2)} {b.currency}</span>
              <div className="flex gap-2">
                {(ACTIONS[b.status] ?? []).map((a) => (
                  <button
                    key={a.label}
                    onClick={() => act(b, a.path)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      a.kind === 'primary'
                        ? 'bg-primary text-primary-foreground hover:opacity-90'
                        : a.kind === 'danger'
                          ? 'border border-red-300 text-red-600 hover:bg-red-50'
                          : 'border hover:bg-muted'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
