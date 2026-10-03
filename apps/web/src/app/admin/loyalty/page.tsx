'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminShell } from '@/components/layout/admin-shell';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';

interface Tier { id: string; name: string; threshold?: string }

export default function AdminLoyaltyPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<{ data: Tier[] } | Tier[]>('/admin/loyalty/tiers').then((res) => {
      if (res.error) setError(res.error.message);
      else {
        const raw = res.data as { data: Tier[] } | Tier[] | null;
        setTiers(Array.isArray(raw) ? raw : (raw?.data ?? []));
      }
      setLoading(false);
    });
  }, []);

  return (
    <AdminShell title="Loyalty" description="Point rules, tiers, rewards and the ledger that backs every balance.">
      {error && <ErrorState description={error} onRetry={() => window.location.reload()} />}
      {!error && !loading && tiers.length === 0 && (
        <EmptyState title="Using default loyalty tiers" description="NEW → BRONZE → SILVER → GOLD → PLATINUM → VIP. Configure thresholds and earning rules here." />
      )}
      {!error && tiers.length > 0 && (
        <DataTable
          caption="Loyalty tiers"
          columns={[
            { key: 'name', header: 'Tier', render: (t: Tier) => <span className="font-medium">{t.name}</span> },
            { key: 'th', header: 'Threshold', render: (t: Tier) => <span className="tabular-nums">{t.threshold ?? '—'}</span> },
          ]}
          rows={tiers}
          keyOf={(t) => t.id}
        />
      )}
      {!error && loading && <p className="text-sm text-muted-foreground">Loading…</p>}
    </AdminShell>
  );
}
