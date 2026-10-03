'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { Tabs } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatMinorUnits } from '@/lib/format';

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
  priceCents: string;
  currency: string;
  service: { title: string };
  customer: { fullName: string };
}

/** Status → allowed backend transition (PATCH, per provider-bookings controller). */
const ACTIONS: Record<string, { label: string; path: string; kind: 'primary' | 'danger' }[]> = {
  PENDING: [
    { label: 'Confirm', path: 'confirm', kind: 'primary' },
    { label: 'Decline', path: 'decline', kind: 'danger' },
  ],
  CONFIRMED: [
    { label: 'Start', path: 'start', kind: 'primary' },
    { label: 'Cancel', path: 'cancel', kind: 'danger' },
  ],
  IN_PROGRESS: [
    { label: 'Complete', path: 'complete', kind: 'primary' },
    { label: 'Cancel', path: 'cancel', kind: 'danger' },
  ],
};

export default function ProviderBookingsPage() {
  const [view, setView] = useState<View>('pending');
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get<{ data: Booking[] } | Booking[]>(`/bookings/provider?view=${view}`)
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
        setError('We couldn’t load bookings.');
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(b: Booking, path: string) {
    setActing(b.id);
    const res = await apiClient.patch(`/bookings/provider/${b.id}/${path}`, {});
    setActing(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== b.id));
  }

  return (
    <ProviderShell title="Bookings" description="Accept, start and complete bookings. Status is always visible; only valid transitions are offered.">
      <Tabs options={VIEWS} value={view} onChange={setView} label="Provider booking views" />
      {loading && <div className="mt-5"><ListSkeleton rows={4} /></div>}
      {error && !loading && <div className="mt-5"><ErrorState description={error} onRetry={load} /></div>}
      {!loading && !error && items.length === 0 && (
        <div className="mt-5">
          <EmptyState
            title={`No ${view} bookings`}
            description={view === 'pending' ? 'New requests will appear here for confirmation.' : 'Bookings in this state will appear here.'}
          />
        </div>
      )}
      <ul className="mt-5 space-y-3">
        {items.map((b) => (
          <li key={b.id} className="card-rest p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{b.service.title}</p>
                <p className="text-sm text-muted-foreground">{b.customer.fullName} · <span className="font-mono text-xs">{b.reference}</span></p>
                <p className="mt-1 text-sm text-muted-foreground"><time dateTime={b.startsAt}>{formatDateTime(b.startsAt)}</time></p>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold tabular-nums">{formatMinorUnits(b.priceCents, b.currency)}</span>
              <div className="flex gap-2">
                {(ACTIONS[b.status] ?? []).map((a) => (
                  <button
                    key={a.label}
                    onClick={() => act(b, a.path)}
                    disabled={acting === b.id}
                    className={`inline-flex min-h-[40px] items-center rounded-md px-3.5 text-sm font-medium transition-micro disabled:opacity-50 ${
                      a.kind === 'primary'
                        ? 'bg-primary text-primary-foreground hover:opacity-90'
                        : 'border border-destructive/40 text-destructive hover:bg-destructive/5'
                    }`}
                  >
                    {acting === b.id ? 'Working…' : a.label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </ProviderShell>
  );
}
