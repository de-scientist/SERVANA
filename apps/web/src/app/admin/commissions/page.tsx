'use client';

import { AdminResourcePage } from '@/components/layout/admin-resource';

interface Rule { id: string; name?: string; rate?: string | number; scope?: string; status?: string }

export default function AdminCommissionsPage() {
  return (
    <AdminResourcePage<Rule>
      title="Commissions"
      description="Configurable rules (percentage, fixed, category or provider specific). Historical transactions keep their snapshot."
      endpoint="/admin/commission-rules"
      searchPlaceholder="Search rules…"
      emptyTitle="No commission rules yet"
      emptyDescription="Standard rules apply until custom rules are configured."
      keyOf={(r) => r.id}
      columns={[
        { key: 'name', header: 'Rule', render: (r) => <span className="font-medium">{r.name ?? r.id.slice(0, 8)}</span> },
        { key: 'rate', header: 'Rate', render: (r) => <span className="tabular-nums">{String(r.rate ?? '—')}</span> },
        { key: 'scope', header: 'Scope', render: (r) => <span className="text-xs">{r.scope ?? '—'}</span> },
      ]}
    />
  );
}
