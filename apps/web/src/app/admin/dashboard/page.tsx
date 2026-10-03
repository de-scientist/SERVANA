'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { AdminShell } from '@/components/layout/admin-shell';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';

interface Overview {
  gtvCents?: string;
  commissionCents?: string;
  bookings?: number;
  activeCustomers?: number;
  activeProviders?: number;
  productsSold?: number;
  pendingVerification?: number;
  pendingPayouts?: number;
  openDisputes?: number;
  currency?: string;
}

/** Operational overview — KPIs with trends where meaningful. No decorative cards. */
export default function AdminDashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<Overview>('/admin/analytics/overview');
    if (res.error) setError(res.error.message);
    else setData(res.data as Overview);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminShell title="Overview" description="What is happening across the marketplace — money, bookings, providers and risk.">
      {error && <ErrorState description={error} onRetry={load} />}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading overview">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5"><Skeleton className="h-7 w-24" /><Skeleton className="mt-2 h-4 w-32" /></div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Gross transaction value" value={data?.gtvCents ?? null} money currency={data?.currency} />
            <Kpi title="Platform commission" value={data?.commissionCents ?? null} money currency={data?.currency} />
            <Kpi title="Bookings" value={data?.bookings != null ? String(data.bookings) : null} />
            <Kpi title="Active providers" value={data?.activeProviders != null ? String(data.activeProviders) : null} />
            <Kpi title="Active customers" value={data?.activeCustomers != null ? String(data.activeCustomers) : null} />
            <Kpi title="Products sold" value={data?.productsSold != null ? String(data.productsSold) : null} />
            <Kpi title="Pending verification" value={data?.pendingVerification != null ? String(data.pendingVerification) : null} href="/admin/verifications" alert={(data?.pendingVerification ?? 0) > 0} />
            <Kpi title="Pending payouts" value={data?.pendingPayouts != null ? String(data.pendingPayouts) : null} href="/admin/payouts" alert={(data?.pendingPayouts ?? 0) > 0} />
          </div>
          {(data?.openDisputes ?? 0) > 0 && (
            <p className="mt-4 rounded-xl border border-destructive/30 bg-card p-4 text-sm" role="alert">
              <strong>{data?.openDisputes} open disputes</strong> need review — <Link href="/admin/disputes" className="text-primary hover:underline">open disputes</Link>.
            </p>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Investigate">
            {[
              { href: '/admin/analytics', title: 'Analytics', text: 'Funnel, providers, attribution' },
              { href: '/admin/bookings', title: 'Bookings', text: 'Search, filter, investigate' },
              { href: '/admin/fraud', title: 'Fraud alerts', text: 'Review flagged activity' },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="card-rest p-5 transition-micro hover:border-primary/50">
                <p className="font-semibold">{c.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Kpi({ title, value, money, currency, href, alert }: { title: string; value: string | null | undefined; money?: boolean; currency?: string; href?: string; alert?: boolean }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums">
        {value == null ? '—' : money ? `${currency ?? 'KES'} ${Math.floor(Number(value) / 100).toLocaleString('en-KE')}` : Number(value).toLocaleString()}
      </p>
    </>
  );
  const cls = `rounded-xl border bg-card p-5 transition-micro hover:border-primary/40 ${alert ? 'border-amber-300' : ''}`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}
