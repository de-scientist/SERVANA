'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatMinorUnits } from '@/lib/format';

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

interface Earnings {
  availableCents?: string;
  pendingCents?: string;
  totalEarnedCents?: string;
  currency?: string;
}

/** Answers: "How is my business doing today?" Every metric supports a decision. */
export default function ProviderDashboardPage() {
  const [pending, setPending] = useState<Booking[]>([]);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, u, e] = await Promise.all([
        apiClient.get<{ data: Booking[] } | Booking[]>('/bookings/provider?view=pending'),
        apiClient.get<{ data: Booking[] } | Booking[]>('/bookings/provider?view=upcoming'),
        apiClient.get<Earnings>('/payments/payouts/earnings'),
      ]);
      const unwrap = (v: unknown): Booking[] => {
        const d = v as { data: Booking[] } | Booking[] | null;
        return Array.isArray(d) ? d : (d?.data ?? []);
      };
      if (p.error && u.error && e.error) {
        setError(p.error.message);
      } else {
        if (!p.error) setPending(unwrap(p.data));
        if (!u.error) setUpcoming(unwrap(u.data));
        if (!e.error && e.data) setEarnings(e.data as Earnings);
      }
    } catch {
      setError('We couldn’t load your dashboard.');
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = upcoming.filter((b) => {
    const d = new Date(b.startsAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  return (
    <ProviderShell
      title="Dashboard"
      description="Today's bookings, pending requests, earnings and what needs your attention."
    >
      {error && <ErrorState description={error} onRetry={load} />}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading dashboard">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5"><Skeleton className="h-8 w-20" /><Skeleton className="mt-2 h-4 w-32" /></div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric title="Today's bookings" value={String(today.length)} hint="Scheduled for today" href="/provider/bookings" />
            <Metric title="Pending requests" value={String(pending.length)} hint="Need confirmation" href="/provider/bookings" alert={pending.length > 0} />
            <Metric
              title="Available balance"
              value={earnings?.availableCents != null ? formatMinorUnits(earnings.availableCents, earnings.currency ?? 'KES') : '—'}
              hint="Ready to pay out"
              href="/provider/earnings"
            />
            <Metric
              title="Upcoming"
              value={String(upcoming.length)}
              hint="Confirmed & scheduled"
              href="/provider/bookings"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card-rest p-5" aria-labelledby="needs-h">
              <div className="flex items-center justify-between">
                <h2 id="needs-h" className="font-semibold">Needs your attention</h2>
                <Link href="/provider/bookings" className="text-sm font-medium text-primary hover:underline">Manage</Link>
              </div>
              {pending.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing waiting — new requests will appear here.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {pending.slice(0, 4).map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="truncate">{b.service.title} · {b.customer.fullName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(b.startsAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card-rest p-5" aria-labelledby="upnext-h">
              <div className="flex items-center justify-between">
                <h2 id="upnext-h" className="font-semibold">Up next</h2>
                <Link href="/provider/availability" className="text-sm font-medium text-primary hover:underline">Availability</Link>
              </div>
              {upcoming.length === 0 ? (
                <div className="mt-2">
                  <EmptyState title="No upcoming bookings" description="Share your profile link to get discovered from social media." />
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {upcoming.slice(0, 4).map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="truncate font-medium">{b.service.title}</span>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Quick actions">
            {[
              { href: '/provider/services', title: 'Manage services', text: 'Create, edit, activate' },
              { href: '/provider/performance', title: 'Performance', text: 'Quality score & reviews' },
              { href: '/provider/ai', title: 'AI tools', text: 'Drafts you approve' },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="card-rest p-4 transition-micro hover:border-primary/50">
                <p className="font-semibold">{c.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{c.text}</p>
              </Link>
            ))}
          </section>
        </>
      )}
    </ProviderShell>
  );
}

function Metric({ title, value, hint, href, alert }: { title: string; value: string; hint: string; href: string; alert?: boolean }) {
  return (
    <Link href={href} className={`card-rest block p-5 transition-micro hover:border-primary/50 ${alert ? 'border-amber-300' : ''}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}
