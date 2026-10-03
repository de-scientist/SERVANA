import { notFound } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { StatusBadge } from '@/components/ui/status-badge';
import { Breadcrumb } from '@/components/ui/tabs';
import { formatDateTime, formatMinorUnits } from '@/lib/format';
import { headers } from 'next/headers';

interface BookingDetail {
  id: string;
  reference: string;
  status: string;
  paymentStatus?: string;
  startsAt: string;
  endsAt?: string;
  priceCents: string;
  currency: string;
  service?: { title?: string; name?: string };
  provider?: { businessName?: string; slug?: string };
  location?: string;
}

/** Booking confirmation / detail — renders backend-verified payment status only. */
export default async function BookingDetailPage({ params }: { params: { id: string } }) {
  const cookie = headers().get('cookie') ?? '';
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  let booking: BookingDetail | null = null;
  try {
    const res = await fetch(`${base}/api/v1/bookings/${encodeURIComponent(params.id)}`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as { data: BookingDetail };
      booking = json.data;
    }
  } catch {
    booking = null;
  }
  void apiClient;

  if (!booking) notFound();

  const serviceName = booking.service?.title ?? booking.service?.name ?? 'Service';
  const confirmed = ['CONFIRMED', 'PROVIDER_ACCEPTED', 'PAID'].includes(booking.status);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My bookings', href: '/bookings' }, { label: booking.reference }]} />

      <section className="mt-4 rounded-2xl border bg-card p-6 text-center" aria-labelledby="confirm-h">
        <p className={`mx-auto inline-flex rounded-full px-3 py-1 text-xs font-semibold ${confirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {confirmed ? 'Booking confirmed' : booking.status.replace(/_/g, ' ')}
        </p>
        <h1 id="confirm-h" className="type-h2 mt-2">{confirmed ? 'You’re booked.' : 'Booking received.'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reference <span className="font-mono font-semibold text-foreground">{booking.reference}</span>
          {booking.paymentStatus ? (
            <> · Payment (backend-verified): <strong>{booking.paymentStatus}</strong></>
          ) : null}
        </p>
      </section>

      <section className="card-rest mt-4 p-5" aria-label="Booking summary">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Provider</dt><dd className="font-medium">{booking.provider?.businessName ?? '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Service</dt><dd className="font-medium">{serviceName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">When</dt><dd className="font-medium"><time dateTime={booking.startsAt}>{formatDateTime(booking.startsAt)}</time></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={booking.status} /></dd></div>
          <div className="flex justify-between gap-3 border-t pt-2.5"><dt className="text-muted-foreground">Total</dt><dd className="text-base font-bold tabular-nums">{formatMinorUnits(booking.priceCents, booking.currency)}</dd></div>
        </dl>
      </section>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Link href="/bookings" className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-primary font-medium text-primary-foreground">View all bookings</Link>
        {booking.provider?.slug && (
          <Link href={`/providers/${booking.provider.slug}`} className="inline-flex min-h-[48px] items-center justify-center rounded-xl border font-medium">Contact provider</Link>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Add to calendar, directions and receipts use the verified details above.</p>
    </main>
  );
}
