'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';

interface Customer {
  id: string;
  fullName?: string;
  name?: string;
  bookings?: number;
  totalBookings?: number;
  lastVisit?: string;
}

/** CRM list — only customers linked to this provider's bookings (policy-safe). */
export default function ProviderCustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<{ data: Customer[] } | Customer[]>('/providers/me/customers');
    if (res.error) {
      // Backend may not expose a dedicated CRM endpoint yet — say so honestly.
      setError(res.error.message);
      setRows([]);
    } else {
      const raw = res.data as { data: Customer[] } | Customer[] | null;
      setRows(Array.isArray(raw) ? raw : (raw?.data ?? []));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProviderShell title="Customers" description="People who booked you — repeat rate and last visit help you follow up.">
      {loading && <ListSkeleton rows={4} />}
      {error && !loading && (
        <ErrorState
          title="Customer list isn't available yet"
          description="The CRM endpoint is still being rolled out. Your bookings list already shows each customer per appointment."
          onRetry={load}
        />
      )}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="No customers yet" description="Customers appear here after their first completed booking with you." />
      )}
      {!loading && !error && rows.length > 0 && (
        <DataTable
          caption="Customers"
          columns={[
            { key: 'name', header: 'Customer', render: (c: Customer) => <span className="font-medium">{c.fullName ?? c.name ?? c.id.slice(0, 8)}</span> },
            { key: 'bookings', header: 'Bookings', render: (c: Customer) => <span className="tabular-nums">{c.bookings ?? c.totalBookings ?? '—'}</span> },
            { key: 'last', header: 'Last visit', render: (c: Customer) => <span>{c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : '—'}</span> },
          ]}
          rows={rows}
          keyOf={(c) => c.id}
        />
      )}
    </ProviderShell>
  );
}
