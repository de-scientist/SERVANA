'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMinorUnits } from '@/lib/format';

interface EarningRow {
  id: string;
  grossCents: string;
  commissionCents: string;
  earningCents: string;
  currency: string;
  payoutStatus: string;
  createdAt: string;
}

interface EarningsDashboard {
  availableCents?: string;
  pendingCents?: string;
  totalEarnedCents?: string;
  commissionPaidCents?: string;
  currency?: string;
  transactions?: EarningRow[];
}

/** Financial dashboard — every deduction explained, never obscured. */
export default function ProviderEarningsPage() {
  const [data, setData] = useState<EarningsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<EarningsDashboard>('/payments/payouts/earnings');
    if (res.error) setError(res.error.message);
    else setData(res.data as EarningsDashboard);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currency = data?.currency ?? 'KES';

  return (
    <ProviderShell title="Earnings" description="Available and pending balances, commission paid, and a transparent transaction ledger.">
      {loading && <ListSkeleton rows={4} />}
      {error && !loading && <ErrorState description={error} onRetry={load} />}
      {!loading && !error && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Money title="Available balance" cents={data.availableCents} currency={currency} />
            <Money title="Pending balance" cents={data.pendingCents} currency={currency} />
            <Money title="Total earned" cents={data.totalEarnedCents} currency={currency} />
            <Money title="Commission paid" cents={data.commissionPaidCents} currency={currency} />
          </div>
          <h2 className="mt-6 font-semibold">Transactions</h2>
          <p className="mt-1 text-xs text-muted-foreground">Each row shows gross → commission → your earning → payout status.</p>
          {(data.transactions ?? []).length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No earnings yet" description="Completed, paid bookings will appear here with full breakdowns." />
            </div>
          ) : (
            <div className="mt-3">
              <DataTable
                caption="Earning transactions"
                columns={[
                  { key: 'date', header: 'Date', render: (t: EarningRow) => new Date(t.createdAt).toLocaleDateString() },
                  { key: 'gross', header: 'Gross', render: (t: EarningRow) => <span className="tabular-nums">{formatMinorUnits(t.grossCents, t.currency)}</span> },
                  { key: 'comm', header: 'Commission', render: (t: EarningRow) => <span className="tabular-nums">{formatMinorUnits(t.commissionCents, t.currency)}</span> },
                  { key: 'earn', header: 'You earn', render: (t: EarningRow) => <strong className="tabular-nums">{formatMinorUnits(t.earningCents, t.currency)}</strong> },
                  { key: 'payout', header: 'Payout', render: (t: EarningRow) => <StatusBadge status={t.payoutStatus} /> },
                ]}
                rows={data.transactions ?? []}
                keyOf={(t) => t.id}
              />
            </div>
          )}
        </>
      )}
    </ProviderShell>
  );
}

function Money({ title, cents, currency }: { title: string; cents?: string; currency: string }) {
  return (
    <div className="card-rest p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{cents != null ? formatMinorUnits(cents, currency) : '—'}</p>
    </div>
  );
}
