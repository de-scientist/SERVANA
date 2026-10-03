'use client';

import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';

interface Product { id: string; name: string; status?: string; price?: number; currency?: string }

export default function AdminProductsPage() {
  return (
    <AdminResourcePage<Product>
      title="Products"
      description="Catalogue, variants, inventory and cross-sell links."
      endpoint="/admin/products"
      searchPlaceholder="Search products…"
      emptyTitle="No products found"
      emptyDescription="Products appear here once the catalogue is seeded."
      keyOf={(p) => p.id}
      columns={[
        { key: 'name', header: 'Product', render: (p) => <span className="font-medium">{p.name}</span> },
        { key: 'price', header: 'Price', render: (p) => <span className="tabular-nums">{p.price ?? '—'} {p.currency ?? ''}</span> },
        { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status ?? 'ACTIVE'} /> },
      ]}
    />
  );
}
