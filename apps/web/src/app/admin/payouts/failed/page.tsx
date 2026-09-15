'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

interface FailedPayout {
  id: string;
  providerId: string;
  status: string;
  totalCents: string;
  currency: string;
  reference: string;
  retryCount: number;
  failedCount: number;
  items: Array<{ earningId: string; earningStatus: string; amountCents: string }>;
  createdAt: string;
}

export default function FailedPayoutsPage() {
  const [payouts, setPayouts] = useState<FailedPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    apiClient.get<{ data: FailedPayout[] }>('/payments/payouts/failed')
      .then((res) => {
        if (res.error) { setError(res.error.message); setPayouts([]); }
        else { setPayouts((res.data as FailedPayout[]) ?? []); }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-muted-foreground">Loading failed payouts…</p></main>;
  if (error) return <main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-red-700">Failed Payouts</h1>
      <p className="mt-2 text-sm text-muted-foreground">{payouts.length} failed payout(s) requiring attention</p>
      {payouts.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No failed payouts.</p>}
      <ul className="mt-4 space-y-3">
        {payouts.map((p) => (
          <li key={p.id} className="rounded-lg border border-red-200 bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{p.reference}</p>
                <p className="text-sm text-muted-foreground">{formatPrice(p.totalCents, p.currency)} · {p.items.length} item(s) · Retry: {p.retryCount}</p>
              </div>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">FAILED</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => router.push(`/payments/payouts/${p.id}/retry`)} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">Retry</button>
              <button onClick={() => router.push(`/admin/payouts/transactions/${p.id}`)} className="rounded-md border px-3 py-1.5 text-xs">View Details</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
