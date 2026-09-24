'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

interface PayoutItem {
  id: string;
  providerId: string;
  method: { type: string; detailsRef: string } | null;
  status: string;
  totalCents: string;
  currency: string;
  reference: string;
  retryCount: number;
  failedCount: number;
  items: Array<{ earningId: string; earningStatus: string; amountCents: string }>;
  createdAt: string;
}

interface PayoutSummary {
  totalPayouts: number;
  failedCount: number;
  successfulCount: number;
  pendingCount: number;
  processingCount?: number;
  reversedCount?: number;
}

interface AdminDashboardData {
  payouts: PayoutItem[];
  summary: PayoutSummary;
  failedPayouts: PayoutItem[];
}

export default function AdminPayoutDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const params = statusFilter ? `?status=${statusFilter}` : '';
    // GET /payments/payouts/dashboard responds { data: { payouts, summary, failedPayouts }, meta },
    // and apiClient already unwraps the outer { data }, so res.data may be
    // either the inner payload or { data, meta }. Handle both shapes.
    apiClient.get<AdminDashboardData | { data: AdminDashboardData }>(`/payments/payouts/dashboard${params}`)
      .then((res) => {
        if (res.error) { setError(res.error.message); setData(null); }
        else {
          const raw = res.data as AdminDashboardData | { data: AdminDashboardData } | null;
          const inner = raw && 'data' in (raw as object) && (raw as { data: AdminDashboardData }).data?.payouts
            ? (raw as { data: AdminDashboardData }).data
            : (raw as AdminDashboardData);
          setData(inner);
        }
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  if (loading) return <main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-muted-foreground">Loading payout dashboard…</p></main>;
  if (error) return <main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-red-600">{error}</p></main>;
  if (!data || !Array.isArray((data as AdminDashboardData).payouts)) return <main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-muted-foreground">No payout data available.</p></main>;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      PROCESSING: 'bg-blue-100 text-blue-800',
      SUCCESSFUL: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
      REVERSED: 'bg-gray-100 text-gray-800',
    };
    return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-muted'}`}>{status}</span>;
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Payout Dashboard</h1>
      <div className="mt-4 flex gap-2">
        {['', 'PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSED'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'border'}`}>{s || 'All'}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Total Payouts</p><p className="mt-1 text-xl font-bold">{data.summary.totalPayouts}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Pending</p><p className="mt-1 text-xl font-bold">{data.summary.pendingCount}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Successful</p><p className="mt-1 text-xl font-bold">{data.summary.successfulCount}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Failed</p><p className="mt-1 text-xl font-bold text-red-600">{data.summary.failedCount}</p></div>
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-semibold">All Payouts</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b"><th className="p-2 text-left">Reference</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Method</th><th className="p-2 text-left">Created</th><th className="p-2 text-left">Detail</th></tr></thead>
            <tbody>
              {data.payouts.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="p-2">{p.reference}</td>
                  <td className="p-2">{statusBadge(p.status)}</td>
                  <td className="p-2">{formatPrice(p.totalCents, p.currency)}</td>
                  <td className="p-2">{p.method?.type ?? '—'}</td>
                  <td className="p-2">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="p-2"><a className="underline" href={`/admin/payouts/transactions/${p.id}`}>View</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
