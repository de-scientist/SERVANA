'use client';

import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';

interface Row { id: string; name?: string; title?: string; status?: string; priceCents?: string; price?: number; currency?: string }

export default function AdminServicesPage() {
  return (
    <AdminResourcePage<Row>
      title="Services"
      description="Platform service catalogue across providers and categories."
      endpoint="/search"
      searchPlaceholder="Search services…"
      emptyTitle="No services found"
      emptyDescription="Services appear here once providers publish them."
      keyOf={(r) => r.id}
      columns={[
        { key: 'name', header: 'Service', render: (r) => <span className="font-medium">{r.name ?? r.title ?? r.id.slice(0, 8)}</span> },
        { key: 'price', header: 'Price', render: (r) => <span className="tabular-nums">{r.priceCents ?? r.price ?? '—'} {r.currency ?? ''}</span> },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status ?? 'ACTIVE'} /> },
      ]}
    />
  );
}
