'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast';

interface Verification {
  providerId: string;
  businessName?: string | null;
  level?: string | null;
  status?: string;
  documents?: number;
}

export default function AdminVerificationsPage() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function review(providerId: string, decision: 'APPROVE' | 'REJECT') {
    setBusy(providerId);
    const res = await apiClient.post(`/admin/verifications/${providerId}/review`, { decision });
    setBusy(null);
    if (res.error) toast(res.error.message, 'error');
    else {
      toast(decision === 'APPROVE' ? 'Provider verified.' : 'Verification rejected.', 'success');
      window.location.reload();
    }
  }

  return (
    <AdminResourcePage<Verification>
      title="Verification"
      description="Review identity and professional documents. Sensitive files open via expiring private URLs only."
      endpoint="/admin/verifications"
      searchPlaceholder="Search by business…"
      emptyTitle="Verification queue is clear"
      emptyDescription="New provider submissions will appear here for review."
      keyOf={(v) => v.providerId}
      columns={[
        { key: 'biz', header: 'Provider', render: (v) => <span className="font-medium">{v.businessName ?? v.providerId.slice(0, 8)}</span> },
        { key: 'level', header: 'Level', render: (v) => <span className="text-xs">{(v.level ?? '—').replace(/_/g, ' ')}</span> },
        { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status ?? 'PENDING'} /> },
        {
          key: 'actions', header: 'Review', render: (v) => (
            <span className="flex gap-1.5">
              <Button size="sm" disabled={busy === v.providerId} onClick={() => review(v.providerId, 'APPROVE')}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busy === v.providerId} onClick={() => review(v.providerId, 'REJECT')}>Reject</Button>
            </span>
          ),
        },
      ]}
    />
  );
}
