'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

interface EarningsDashboard {
  providerId: string;
  currency?: string;
  // Canonical Phase-7 names
  grossEarningsCents?: string;
  platformCommissionCents?: string;
  paymentFeesCents?: string;
  refundsCents?: string;
  adjustmentsCents?: string;
  pendingEarningsCents: string;
  availableEarningsCents: string;
  paidEarningsCents?: string;
  paidOutCents?: string;
  // Legacy aliases (still returned by the API)
  totalGrossCents?: string;
  totalCommissionCents?: string;
  totalPaymentFeesCents?: string;
  totalRefundCents?: string;
  totalAdjustmentCents?: string;
  totalNetCents?: string;
  totalEarningsCents?: string;
  totalPaidOutCents?: string;
}

export default function ProviderEarningsPage() {
  const [dashboard, setDashboard] = useState<EarningsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<EarningsDashboard>('/payments/payouts/earnings')
      .then((res) => {
        if (res.error) { setError(res.error.message); setDashboard(null); }
        else { setDashboard(res.data as EarningsDashboard); }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-muted-foreground">Loading earnings…</p></main>;
  if (error) return <main className="mx-auto max-w-5xl px-4 py-10"><p className="text-sm text-red-600">{error}</p></main>;
  if (!dashboard) return null;

  const metric = (label: string, value: string) => (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{formatPrice(value)}</p>
    </div>
  );

  const gross = dashboard.grossEarningsCents ?? dashboard.totalGrossCents ?? '0';
  const commission = dashboard.platformCommissionCents ?? dashboard.totalCommissionCents ?? '0';
  const fees = dashboard.paymentFeesCents ?? dashboard.totalPaymentFeesCents ?? '0';
  const refunds = dashboard.refundsCents ?? dashboard.totalRefundCents ?? '0';
  const adjustments = dashboard.adjustmentsCents ?? dashboard.totalAdjustmentCents ?? '0';
  const paid = dashboard.paidEarningsCents ?? dashboard.paidOutCents ?? dashboard.totalPaidOutCents ?? '0';
  const net = dashboard.totalNetCents ?? dashboard.totalEarningsCents ?? '0';

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Provider Earnings</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metric('Gross Earnings', gross)}
        {metric('Platform Commission', `-${commission}`)}
        {metric('Payment Fees', `-${fees}`)}
        {metric('Refunds', `-${refunds}`)}
        {metric('Adjustments', adjustments)}
        {metric('Pending Earnings', dashboard.pendingEarningsCents)}
        {metric('Available Earnings', dashboard.availableEarningsCents)}
        {metric('Paid Earnings', paid)}
        {metric('Net Earnings', net)}
      </div>
    </main>
  );
}
