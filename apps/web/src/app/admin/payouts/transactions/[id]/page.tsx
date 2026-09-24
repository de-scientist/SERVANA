'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

interface TransactionItem {
  id: string;
  paymentId?: string;
  type: string;
  amountCents: string;
  currency: string;
  createdAt: string;
}

interface PayoutItem {
  id: string;
  earningId: string;
  earningStatus?: string;
  bookingId?: string | null;
  amountCents: string;
}

interface RelatedPayment {
  id: string;
  bookingId: string | null;
  status: string;
  grossCents: string;
  commissionCents: string;
  netCents: string;
  currency: string;
}

interface AuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

interface TransactionDetail {
  id: string;
  providerId: string;
  method: { type: string; detailsRef: string } | null;
  status: string;
  totalCents: string;
  currency: string;
  reference: string;
  retryCount: number;
  failedCount: number;
  items: PayoutItem[];
  relatedPayments?: RelatedPayment[];
  transactions: TransactionItem[];
  auditTrail?: AuditEntry[];
  createdAt: string;
}

export default function TransactionDetailPage({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    apiClient.get<TransactionDetail>(`/payments/payouts/${params.id}/transactions`)
      .then((res) => {
        if (res.error) { setError(res.error.message); setDetail(null); }
        else { setDetail(res.data as TransactionDetail); }
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <main className="mx-auto max-w-4xl px-4 py-10"><p className="text-sm text-muted-foreground">Loading transaction…</p></main>;
  if (error) return <main className="mx-auto max-w-4xl px-4 py-10"><p className="text-sm text-red-600">{error}</p></main>;
  if (!detail) return null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <button onClick={() => router.back()} className="mb-4 text-sm text-primary underline">← Back</button>
      <h1 className="text-2xl font-bold">Transaction: {detail.reference}</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 font-bold">{detail.status}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-bold">{formatPrice(detail.totalCents, detail.currency)}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Method</p><p className="mt-1 font-bold">{detail.method?.type ?? '—'}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Retries</p><p className="mt-1 font-bold">{detail.retryCount}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Failed</p><p className="mt-1 font-bold">{detail.failedCount}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Provider</p><p className="mt-1 font-bold">{detail.providerId.slice(0, 8)}…</p></div>
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Payout Items</h2>
        {detail.items.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No earning items linked to this payout.</p>}
        {detail.items.length > 0 && (
          <table className="mt-2 w-full border-collapse text-sm">
            <thead><tr className="border-b"><th className="p-2 text-left">Earning</th><th className="p-2 text-left">Earning Status</th><th className="p-2 text-right">Amount</th></tr></thead>
            <tbody>
              {detail.items.map((i) => (
                <tr key={i.id} className="border-b"><td className="p-2">{i.earningId.slice(0, 8)}…</td><td className="p-2">{i.earningStatus ?? '—'}</td><td className="p-2 text-right">{formatPrice(i.amountCents)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(detail.relatedPayments ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Related Payments</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead><tr className="border-b"><th className="p-2 text-left">Payment</th><th className="p-2 text-left">Status</th><th className="p-2 text-right">Gross</th><th className="p-2 text-right">Commission</th></tr></thead>
            <tbody>
              {(detail.relatedPayments ?? []).map((p) => (
                <tr key={p.id} className="border-b"><td className="p-2">{p.id.slice(0, 8)}…</td><td className="p-2">{p.status}</td><td className="p-2 text-right">{formatPrice(p.grossCents, p.currency)}</td><td className="p-2 text-right">{formatPrice(p.commissionCents, p.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Transaction Ledger</h2>
        {detail.transactions.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No ledger transactions recorded for the linked payments yet.</p>}
        {detail.transactions.length > 0 && (
          <table className="mt-2 w-full border-collapse text-sm">
            <thead><tr className="border-b"><th className="p-2 text-left">Type</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Date</th></tr></thead>
            <tbody>
              {detail.transactions.map((t) => (
                <tr key={t.id} className="border-b"><td className="p-2">{t.type}</td><td className="p-2 text-right">{formatPrice(t.amountCents, t.currency)}</td><td className="p-2">{new Date(t.createdAt).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(detail.auditTrail ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Audit Trail</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {(detail.auditTrail ?? []).map((a) => (
              <li key={a.id} className="rounded-lg border bg-card p-3">
                <p className="font-medium">{a.action}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}{a.actorId ? ` · ${a.actorId.slice(0, 8)}…` : ''}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
