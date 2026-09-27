'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

interface Overview {
  revenue: { grossCents: string; payments: number; paymentFeesCents: string; commissionCents: string; refundedCents: string; netCents: string };
  bookings: { total: number; completed: number; cancelled: number; completionRate: number };
  retention: { customersWithBookings: number; repeatCustomers: number; repeatRate: number };
}

interface Funnel {
  viewed: number; started: number; created: number; paid: number;
  viewToStart: number; startToCreate: number; createToPay: number; overall: number;
}

interface ProviderRow {
  providerId: string; revenueCents: string; commissionCents: string;
  completedJobs: number; avgRating: number; totalReviews: number;
}

interface Products {
  orders: number; units: number; salesCents: string;
  topProducts: { productId: string; name: string; units: number; salesCents: string }[];
}

interface Attribution {
  channels: { channel: string; users: number; bookings: number; revenueCents: string }[];
  providerViews: { providerSlug: string; views: number }[];
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [products, setProducts] = useState<Products | null>(null);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    const qs = params.toString() ? `?${params.toString()}` : '';
    const [o, f, p, pr, a] = await Promise.all([
      apiClient.get<Overview>(`/admin/analytics/overview${qs}`),
      apiClient.get<Funnel>(`/admin/analytics/funnel${qs}`),
      apiClient.get<{ data: ProviderRow[] }>('/admin/analytics/providers?limit=10'),
      apiClient.get<Products>(`/admin/analytics/products${qs}`),
      apiClient.get<Attribution>(`/admin/analytics/attribution${qs}`),
    ]);
    const firstError = [o, f, p, pr, a].find((r) => r.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      setOverview(o.data as Overview);
      setFunnel(f.data as Funnel);
      const pd = p.data as unknown as { data: ProviderRow[] };
      setProviders(pd.data ?? []);
      setProducts(pr.data as Products);
      setAttribution(a.data as Attribution);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold">Marketplace analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Money metrics aggregate ledger tables; behavioural metrics aggregate tracked events. No vanity metrics.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-3 py-1.5 text-sm" />
        <span className="text-sm text-muted-foreground">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-3 py-1.5 text-sm" />
        <button onClick={load} className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground">Apply range</button>
      </div>

      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {overview && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Revenue — is the marketplace making money?</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card label="Gross revenue" value={formatPrice(overview.revenue.grossCents)} hint={`${overview.revenue.payments} payments`} />
            <Card label="Net (ex-refunds)" value={formatPrice(overview.revenue.netCents)} />
            <Card label="Commission" value={formatPrice(overview.revenue.commissionCents)} hint="platform take" />
            <Card label="Refunded" value={formatPrice(overview.revenue.refundedCents)} />
            <Card label="Completion" value={pct(overview.bookings.completionRate)} hint={`${overview.bookings.completed}/${overview.bookings.total} bookings`} />
            <Card label="Repeat rate" value={pct(overview.retention.repeatRate)} hint={`${overview.retention.repeatCustomers}/${overview.retention.customersWithBookings} customers`} />
          </div>
        </section>
      )}

      {funnel && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Booking funnel — where does demand leak?</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Card label="Service views" value={String(funnel.viewed)} hint={`→ intent ${pct(funnel.viewToStart)}`} />
            <Card label="Booking intent" value={String(funnel.started)} hint={`→ booked ${pct(funnel.startToCreate)}`} />
            <Card label="Bookings created" value={String(funnel.created)} hint={`→ paid ${pct(funnel.createToPay)}`} />
            <Card label="Paid" value={String(funnel.paid)} hint={`overall ${pct(funnel.overall)}`} />
          </div>
        </section>
      )}

      {providers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Providers — who drives the marketplace?</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Provider</th>
                  <th className="p-2 text-right">Revenue</th>
                  <th className="p-2 text-right">Jobs</th>
                  <th className="p-2 text-right">Rating</th>
                  <th className="p-2 text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((r) => (
                  <tr key={r.providerId} className="border-b">
                    <td className="p-2">{r.providerId.slice(0, 8)}…</td>
                    <td className="p-2 text-right">{formatPrice(r.revenueCents)}</td>
                    <td className="p-2 text-right">{r.completedJobs}</td>
                    <td className="p-2 text-right">{r.avgRating > 0 ? `${r.avgRating.toFixed(1)} (${r.totalReviews})` : '—'}</td>
                    <td className="p-2 text-right">{formatPrice(r.commissionCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {products && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Products — is the shelf working?</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Card label="Paid orders" value={String(products.orders)} />
            <Card label="Units sold" value={String(products.units)} />
            <Card label="Product sales" value={formatPrice(products.salesCents)} hint="paid orders only" />
          </div>
          {products.topProducts.length > 0 && (
            <ul className="mt-3 space-y-2">
              {products.topProducts.map((t) => (
                <li key={t.productId} className="flex justify-between rounded-lg border bg-card p-3 text-sm">
                  <span>{t.name} <span className="text-muted-foreground">× {t.units}</span></span>
                  <span className="font-semibold">{formatPrice(t.salesCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {attribution && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Attribution — which channels bring money?</h2>
          <p className="mt-1 text-xs text-muted-foreground">First touch per user wins; untracked users count as direct.</p>
          {attribution.channels.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No attributed traffic yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Channel</th>
                    <th className="p-2 text-right">Users</th>
                    <th className="p-2 text-right">Bookings</th>
                    <th className="p-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {attribution.channels.map((c) => (
                    <tr key={c.channel} className="border-b">
                      <td className="p-2">{c.channel}</td>
                      <td className="p-2 text-right">{c.users}</td>
                      <td className="p-2 text-right">{c.bookings}</td>
                      <td className="p-2 text-right">{formatPrice(c.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
