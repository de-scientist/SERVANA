'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';

export default function AdminDisputesPage() {
  return (
    <AdminShell title="Disputes" description="Customer and provider reports with evidence, refunds and auditable decisions.">
      <EmptyState
        title="No open disputes"
        description="Disputes are filed from booking conversations. Each decision (refund, partial refund, reject, payout adjustment) is recorded with actor and reason."
      />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Related: <Link href="/admin/bookings" className="text-primary hover:underline">Bookings</Link> ·{' '}
        <Link href="/admin/payments" className="text-primary hover:underline">Payments</Link> ·{' '}
        <Link href="/admin/fraud" className="text-primary hover:underline">Fraud</Link>
      </p>
    </AdminShell>
  );
}
