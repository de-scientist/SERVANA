'use client';

import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';

interface Order { id: string; status: string; totalCents?: string; currency?: string }

export default function AdminOrdersPage() {
  return (
    <AdminResourcePage<Order>
      title="Orders"
      description="Product orders: payment, fulfilment, delivery and refunds."
      endpoint="/admin/orders"
      searchPlaceholder="Search orders…"
      emptyTitle="No orders found"
      emptyDescription="Orders appear here once customers check out."
      keyOf={(o) => o.id}
      columns={[
        { key: 'id', header: 'Order', render: (o) => <span className="font-mono text-xs">{o.id.slice(0, 8)}</span> },
        { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
        { key: 'total', header: 'Total', render: (o) => <span className="tabular-nums">{o.totalCents ?? '—'} {o.currency ?? ''}</span> },
      ]}
    />
  );
}
