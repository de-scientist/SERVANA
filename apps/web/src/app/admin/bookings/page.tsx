'use client';

import Link from 'next/link';
import { AdminResourcePage } from '@/components/layout/admin-resource';
import { StatusBadge } from '@/components/ui/status-badge';

interface Booking { id: string; reference?: string; status: string; startsAt?: string; priceCents?: string; currency?: string }

export default function AdminBookingsPage() {
  return (
    <AdminResourcePage<Booking>
      title="Bookings"
      description="Investigate bookings across customers and providers — status, timing and money."
      endpoint="/admin/bookings"
      searchPlaceholder="Search by reference…"
      emptyTitle="No bookings found"
      emptyDescription="Bookings appear here as customers book. Try widening the search."
      keyOf={(b) => b.id}
      columns={[
        { key: 'ref', header: 'Reference', render: (b) => <Link href={`/admin/bookings/${b.id}`} className="font-mono text-xs text-primary hover:underline">{b.reference ?? b.id.slice(0, 8)}</Link> },
        { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
        { key: 'when', header: 'When', render: (b) => <span className="text-xs">{b.startsAt ? new Date(b.startsAt).toLocaleString() : '—'}</span> },
        { key: 'amount', header: 'Amount', render: (b) => <span className="tabular-nums">{b.priceCents ?? '—'} {b.currency ?? ''}</span> },
      ]}
    />
  );
}
