'use client';

import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';

interface Promo { id: string; code?: string; name?: string; status?: string }

export default function AdminPromotionsPage() {
  return (
    <AdminResourcePage<Promo>
      title="Promotions"
      description="Promo codes and campaigns with redemption tracking."
      endpoint="/admin/promotions"
      searchPlaceholder="Search promotions…"
      emptyTitle="No promotions yet"
      emptyDescription="Create seasonal or referral campaigns here."
      keyOf={(p) => p.id}
      columns={[
        { key: 'name', header: 'Promotion', render: (p) => <span className="font-medium">{p.name ?? p.code ?? p.id.slice(0, 8)}</span> },
        { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status ?? 'ACTIVE'} /> },
      ]}
    />
  );
}
