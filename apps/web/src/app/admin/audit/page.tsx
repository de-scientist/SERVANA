import { AdminShell } from '@/components/layout/admin-shell';
import { EmptyState } from '@/components/ui/empty-state';

export default function AdminAuditPage() {
  return (
    <AdminShell title="Audit Logs" description="Who did what, when — with before/after for commission changes, verifications, payouts, refunds and suspensions.">
      <EmptyState
        title="Audit trail is recording"
        description="Entries list actor, action, entity, timestamp and IP/device metadata. Filter by action or entity from the API: commission.changed, provider.verified, payout.initiated, refund.issued."
      />
    </AdminShell>
  );
}
