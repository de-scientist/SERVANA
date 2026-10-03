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

interface Payout {
  id: string;
  reference: string;
  status: string;
  totalCents: string;
  currency: string;
  createdAt: string;
}

export default function ProviderPayoutsPage() {
  const [rows, setRows] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<{ data: Payout[] } | Payout[]>('/payments/payouts');
    if (res.error) setError(res.error.message);
    else {
      const raw = res.data as { data: Payout[] } | Payout[] | null;
      setRows(Array.isArray(raw) ? raw : (raw?.data ?? []));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProviderShell title="Payouts" description="Where your available balance goes — method, status and history.">
      {loading && <ListSkeleton rows={4} />}
      {error && !loading && <ErrorState description={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="No payouts yet" description="Payouts appear here once your available balance is processed to M-Pesa or bank." />
      )}
      {!loading && !error && rows.length > 0 && (
        <DataTable
          caption="Payout history"
          columns={[
            { key: 'ref', header: 'Reference', render: (p: Payout) => <span className="font-mono text-xs">{p.reference}</span> },
            { key: 'amount', header: 'Amount', render: (p: Payout) => <strong className="tabular-nums">{formatMinorUnits(p.totalCents, p.currency)}</strong> },
            { key: 'status', header: 'Status', render: (p: Payout) => <StatusBadge status={p.status} /> },
            { key: 'date', header: 'Date', render: (p: Payout) => new Date(p.createdAt).toLocaleDateString() },
          ]}
          rows={rows}
          keyOf={(p) => p.id}
        />
      )}
    </ProviderShell>
  );
}
