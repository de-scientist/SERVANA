'use client';

import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useState } from 'react';

interface User {
  id: string;
  email: string;
  name?: string;
  status?: string;
  roles?: string[];
}

export default function AdminUsersPage() {
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    await apiClient.patch(`/admin/users/${id}/status`, { status });
    setBusy(null);
    window.location.reload();
  }

  return (
    <AdminResourcePage<User>
      title="Users"
      description="Search, filter and manage customer, provider and staff accounts safely."
      endpoint="/admin/users"
      searchPlaceholder="Search by name or email…"
      emptyTitle="No users found"
      emptyDescription="Try a broader search. New registrations appear here."
      keyOf={(u) => u.id}
      columns={[
        { key: 'user', header: 'User', render: (u) => <span><span className="font-medium">{u.name ?? u.email}</span><br /><span className="text-xs text-muted-foreground">{u.email}</span></span> },
        { key: 'roles', header: 'Roles', render: (u) => <span className="text-xs">{(u.roles ?? []).join(', ') || '—'}</span> },
        { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status ?? 'ACTIVE'} /> },
        {
          key: 'actions', header: 'Actions', render: (u) => (
            <span className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => setStatus(u.id, u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')}>
                {busy === u.id ? '…' : u.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
              </Button>
            </span>
          ),
        },
      ]}
    />
  );
}
