import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb, SectionHeading } from '@/components/ui/tabs';

export const metadata: Metadata = {
  title: 'Help & Support',
  description: 'Get help with bookings, payments, refunds and disputes on SERVANA.',
  alternates: { canonical: '/support' },
};

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Support' }]} />
      <div className="mt-3">
        <SectionHeading
          eyebrow="Support"
          title="Help & support"
          description="Booking issues, payment questions, refunds and disputes — here's where to go."
        />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {[
          { title: 'My bookings', text: 'View status, cancel where allowed, contact provider.', href: '/bookings' },
          { title: 'My orders', text: 'Track product orders and verified payment status.', href: '/orders' },
          { title: 'Messages', text: 'Booking-specific conversations with providers.', href: '/messages' },
          { title: 'Notifications', text: 'Booking, payment and payout updates.', href: '/notifications' },
        ].map((c) => (
          <Link key={c.title} href={c.href} className="card-rest p-5 transition-micro hover:border-primary/50">
            <p className="font-semibold">{c.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.text}</p>
          </Link>
        ))}
      </div>
      <section className="card-rest mt-4 p-5 text-sm" aria-label="Dispute process">
        <h2 className="font-semibold">Something went wrong with a service?</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Open the booking and use <strong>Contact</strong> to message the provider first.</li>
          <li>If unresolved, open a dispute from your messages or notifications.</li>
          <li>An admin reviews evidence; refunds or adjustments are recorded in the ledger.</li>
        </ol>
        <p className="mt-3 text-muted-foreground">Refunds never happen silently — every decision is auditable and shown with its status.</p>
      </section>
    </main>
  );
}
