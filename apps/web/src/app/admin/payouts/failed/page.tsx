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
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // GET /payments/payouts/failed responds with the admin dashboard payload
    // ({ payouts, summary, failedPayouts }, possibly wrapped in { data, meta }).
    apiClient.get<unknown>('/payments/payouts/failed')
      .then((res) => {
        if (res.error) { setError(res.error.message); setPayouts([]); }
        else {
          const raw = res.data as { failedPayouts?: FailedPayout[]; data?: { failedPayouts?: FailedPayout[] } } | null;
          const list = raw?.failedPayouts ?? raw?.data?.failedPayouts ?? [];
          setPayouts(Array.isArray(list) ? list : []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function retryPayout(id: string) {
    setRetryingId(id);
    setError(null);
    const res = await apiClient.post<unknown>(`/payments/payouts/${id}/retry`);
    setRetryingId(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setPayouts((prev) => prev.filter((p) => p.id !== id));
  }

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
              <button onClick={() => retryPayout(p.id)} disabled={retryingId === p.id} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">{retryingId === p.id ? 'Retrying…' : 'Retry'}</button>
              <button onClick={() => router.push(`/admin/payouts/transactions/${p.id}`)} className="rounded-md border px-3 py-1.5 text-xs">View Details</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
