'use client';

import Link from 'next/link';

export default function TransactionsIndexPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Transaction Details</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Select a payout from the <Link className="underline" href="/admin/payouts">payout dashboard</Link> or the{' '}
        <Link className="underline" href="/admin/payouts/failed">failed payouts</Link> view to inspect its
        full money trail (earnings → payments → ledger → audit trail).
      </p>
    </main>
  );
}
