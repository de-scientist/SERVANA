import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Secure Checkout',
  description: 'Complete your product order with backend-verified M-Pesa, card or bank payment.',
  alternates: { canonical: '/checkout' },
};

/** Checkout keeps product orders conceptually distinct from service bookings. */
export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-primary">Secure checkout</p>
      <h1 className="type-h1 mt-1">Review &amp; pay</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Product orders and service bookings stay separate — this checkout is for products in your cart only.
        Service payments happen inside each booking.
      </p>

      <section className="card-rest mt-6 space-y-3 p-5 text-sm" aria-label="Checkout steps">
        <div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span><p><strong>Confirm items</strong> — review quantities in <Link href="/cart" className="text-primary hover:underline">your cart</Link>.</p></div>
        <div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span><p><strong>Choose M-Pesa, card or bank</strong> — totals always shown before you authorise.</p></div>
        <div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span><p><strong>Backend verification</strong> — we only mark payment successful after the provider confirms it.</p></div>
      </section>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button asChild className="min-h-[48px]"><Link href="/cart">Back to cart</Link></Button>
        <Button asChild variant="outline" className="min-h-[48px]"><Link href="/orders">Track my orders</Link></Button>
      </div>
    </main>
  );
}
