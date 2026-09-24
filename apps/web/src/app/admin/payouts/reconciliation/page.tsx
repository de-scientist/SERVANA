'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

interface ReconciliationResult {
  paymentsCount: number;
  paymentsTotalCents: string;
  commissionCount: number;
  commissionTotalCents: string;
  paymentFeeCount: number;
  paymentFeeTotalCents: string;
  earningsCount: number;
  earningsTotalCents: string;
  payoutCount: number;
  payoutTotalCents: string;
  discrepancyCents: string;
  ledgerIntact: boolean;
  dateFrom: string;
  dateTo: string;
  refundsTotalCents?: string;
  adjustmentsTotalCents?: string;
  payoutsSuccessfulCents?: string;
  payoutsPendingCents?: string;
  orphanPaymentsMissingCommission?: string[];
  orphanPaymentsMissingEarning?: string[];
  orphanEarningsWithoutPayment?: string[];
  overPayoutCents?: string;
}

export default function ReconciliationPage() {
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  async function runReconciliation() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    apiClient.get<ReconciliationResult>(`/payments/payouts/reconciliation?${params.toString()}`)
      .then((res) => {
        if (res.error) { setError(res.error.message); setResult(null); }
        else { setResult(res.data as ReconciliationResult); }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    runReconciliation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Reconciliation</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded border px-3 py-1.5 text-sm" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded border px-3 py-1.5 text-sm" />
        <button onClick={runReconciliation} className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground">Run Reconciliation</button>
      </div>
      {loading && <p className="mt-4 text-sm text-muted-foreground">Reconciling…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-6 space-y-4">
          <div className={`rounded-lg border p-4 ${result.ledgerIntact ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <p className="font-semibold">{result.ledgerIntact ? '✓ Ledger intact' : '✗ Ledger discrepancy detected'}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Payments</p><p className="mt-1 font-bold">{result.paymentsCount} · {formatPrice(result.paymentsTotalCents)}</p></div>
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Commission</p><p className="mt-1 font-bold">{result.commissionCount} · {formatPrice(result.commissionTotalCents)}</p></div>
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Payment Fees</p><p className="mt-1 font-bold">{result.paymentFeeCount} · {formatPrice(result.paymentFeeTotalCents)}</p></div>
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Earnings</p><p className="mt-1 font-bold">{result.earningsCount} · {formatPrice(result.earningsTotalCents)}</p></div>
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Payouts</p><p className="mt-1 font-bold">{result.payoutCount} · {formatPrice(result.payoutTotalCents)}</p></div>
            <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Discrepancy</p><p className={`mt-1 font-bold ${result.discrepancyCents !== '0' ? 'text-red-600' : 'text-green-600'}`}>{formatPrice(result.discrepancyCents)}</p></div>
          </div>
          {(result.overPayoutCents !== undefined || result.orphanPaymentsMissingCommission !== undefined) && (
            <div className="rounded-lg border bg-card p-4 text-sm">
              <p className="font-semibold">Referential checks</p>
              <p className="mt-1 text-muted-foreground">Over-payout: {result.overPayoutCents !== undefined ? formatPrice(result.overPayoutCents) : '—'}</p>
              <p className="text-muted-foreground">Payments missing commission: {(result.orphanPaymentsMissingCommission ?? []).length}</p>
              <p className="text-muted-foreground">Payments missing earning: {(result.orphanPaymentsMissingEarning ?? []).length}</p>
              <p className="text-muted-foreground">Earnings without payment: {(result.orphanEarningsWithoutPayment ?? []).length}</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
