import Link from 'next/link';
import { AdminShell } from '@/components/layout/admin-shell';
import { EmptyState } from '@/components/ui/empty-state';

export default function AdminBookingDetailPage({ params }: { params: { id: string } }) {
  return (
    <AdminShell title={`Booking ${params.id.slice(0, 8)}`} description="Full booking investigation — status history, payment and payout linkage.">
      <EmptyState
        title="Booking detail view"
        description="Open the booking from the list to trace its status history, verified payment and provider payout. Deep-linking preserves the investigation trail."
        actionLabel="Back to bookings"
        actionHref="/admin/bookings"
      />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        API: <span className="font-mono">GET /bookings/:id</span> (owner/admin) · status changes are ledger-logged.
      </p>
      <p className="mt-2 text-center text-sm"><Link href="/admin/payments" className="text-primary hover:underline">Go to payments →</Link></p>
    </AdminShell>
  );
}
