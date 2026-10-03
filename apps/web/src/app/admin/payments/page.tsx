'use client';

import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';

interface Payment { id: string; status: string; amountCents?: string; currency?: string; method?: string; reference?: string }

export default function AdminPaymentsPage() {
  return (
    <AdminResourcePage<Payment>
      title="Payments"
      description="Initiations, verifications, refunds — every webhook idempotent, every state explicit."
      endpoint="/admin/payments"
      searchPlaceholder="Search by reference…"
      emptyTitle="No payments found"
      emptyDescription="Payments appear here once customers pay. Pending and failed states are shown honestly."
      keyOf={(p) => p.id}
      columns={[
        { key: 'ref', header: 'Reference', render: (p) => <span className="font-mono text-xs">{p.reference ?? p.id.slice(0, 8)}</span> },
        { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
        { key: 'amount', header: 'Amount', render: (p) => <span className="tabular-nums">{p.amountCents ?? '—'} {p.currency ?? ''}</span> },
        { key: 'method', header: 'Method', render: (p) => <span className="text-xs">{p.method ?? '—'}</span> },
      ]}
    />
  );
}
