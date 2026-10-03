'use client';

import { AdminShell } from '@/components/layout/admin-shell';
import { EmptyState } from '@/components/ui/empty-state';

export default function AdminReviewsPage() {
  return (
    <AdminShell title="Reviews" description="Moderation queue for reported reviews. Only verified, completed-booking reviews exist.">
      <EmptyState
        title="No reviews awaiting moderation"
        description="Reported reviews will appear here with reporter, reason and the original verified booking."
      />
    </AdminShell>
  );
}
