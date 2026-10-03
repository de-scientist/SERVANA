'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Tabs, Breadcrumb } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/sheet';
import { formatDateTime, formatMinorUnits } from '@/lib/format';

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
  priceCents: string;
  currency: string;
  service: { title: string };
  provider: { businessName: string; slug: string };
}

export default function CustomerBookingsPage() {
  const [view, setView] = useState<View>('upcoming');
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<{ data: Booking[] } | Booking[]>(`/bookings?view=${view}`)
      .then((res) => {
        if (res.error) {
          setError(res.error.message);
          setItems([]);
        } else {
          const raw = res.data as { data: Booking[] } | Booking[] | null;
          setItems(Array.isArray(raw) ? raw : (raw?.data ?? []));
        }
      })
      .catch(() => {
        setError('We couldn’t load your bookings.');
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmCancel() {
    if (!cancelling) return;
    setPending(true);
    const res = await apiClient.patch(`/bookings/${cancelling.id}/cancel`, { reason: 'Customer request' });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
    } else {
      setItems((prev) => prev.filter((b) => b.id !== cancelling.id));
    }
    setCancelling(null);
  }

  async function messageProvider(bookingId: string) {
    const res = await apiClient.post<{ id: string }>('/conversations', { bookingId });
    if (!res.error && res.data) {
      window.location.href = `/messages/${(res.data as { id: string }).id}`;
    } else if (res.error) {
      setError(res.error.message);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My bookings' }]} />
      <h1 className="type-h1 mt-3">My bookings</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Upcoming, active, completed and cancelled — with only the actions each state allows.</p>

      <div className="mt-4">
        <Tabs options={VIEWS} value={view} onChange={setView} label="Booking views" />
      </div>

      {loading && <div className="mt-6"><ListSkeleton rows={4} /></div>}
      {error && !loading && (
        <div className="mt-6">
          <ErrorState
            title="We couldn't load your bookings."
            description="Your bookings are safe. Please try again."
            onRetry={load}
          />
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title={view === 'upcoming' ? 'No upcoming bookings' : `No ${view} bookings`}
            description="Your next appointment will appear here."
            actionLabel="Explore services"
            actionHref="/search"
          />
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {items.map((b) => (
          <li key={b.id} className="card-rest p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold leading-tight">{b.service.title}</p>
                <Link href={`/providers/${b.provider.slug}`} className="text-sm text-muted-foreground hover:text-primary hover:underline">
                  {b.provider.businessName}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  <time dateTime={b.startsAt}>{formatDateTime(b.startsAt)}</time>
                  <span className="ml-2 font-mono text-xs">· {b.reference}</span>
                </p>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold tabular-nums">{formatMinorUnits(b.priceCents, b.currency)}</span>
              <div className="flex flex-wrap gap-1.5">
                <Link href={`/bookings/${b.id}`} className="inline-flex min-h-[40px] items-center rounded-md border px-3 text-sm font-medium transition-micro hover:bg-muted">
                  View
                </Link>
                <button
                  onClick={() => messageProvider(b.id)}
                  className="inline-flex min-h-[40px] items-center rounded-md px-3 text-sm font-medium text-primary hover:bg-primary/5"
                >
                  Contact
                </button>
                {['PENDING', 'CONFIRMED'].includes(b.status) && (
                  <button
                    onClick={() => setCancelling(b)}
                    className="inline-flex min-h-[40px] items-center rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/5"
                  >
                    Cancel
                  </button>
                )}
                {b.status === 'COMPLETED' && (
                  <Link href={`/bookings/${b.id}#review`} className="inline-flex min-h-[40px] items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                    Review
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={confirmCancel}
        title="Cancel this booking?"
        description={cancelling ? `${cancelling.service.title} · ${formatDateTime(cancelling.startsAt)}. Cancellation policy applies — refunds (if any) are processed by the backend.` : undefined}
        confirmLabel="Yes, cancel"
        pending={pending}
      />
    </main>
  );
}
