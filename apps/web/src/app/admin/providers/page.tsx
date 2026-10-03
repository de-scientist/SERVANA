'use client';

import Link from 'next/link';
import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';

interface Provider {
  id: string;
  businessName?: string | null;
  slug?: string;
  status?: string;
  city?: string | null;
  verified?: boolean;
}

export default function AdminProvidersPage() {
  return (
    <AdminResourcePage<Provider>
      title="Providers"
      description="Investigate provider accounts, verification state and status."
      endpoint="/admin/providers"
      searchPlaceholder="Search providers…"
      emptyTitle="No providers found"
      emptyDescription="Try a broader search or different status filter."
      keyOf={(p) => p.id}
      columns={[
        { key: 'biz', header: 'Business', render: (p) => <span><span className="font-medium">{p.businessName ?? p.id.slice(0, 8)}</span><br /><span className="text-xs text-muted-foreground">{p.city ?? ''}</span></span> },
        { key: 'ver', header: 'Verified', render: (p) => (p.verified ? <Badge variant="success">✓ Verified</Badge> : <Badge>Unverified</Badge>) },
        { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status ?? 'ACTIVE'} /> },
        { key: 'open', header: 'Open', render: (p) => (p.slug ? <Link href={`/providers/${p.slug}`} className="text-primary hover:underline">View</Link> : <span className="text-muted-foreground">—</span>) },
      ]}
    />
  );
}
