import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-base font-extrabold tracking-tight text-primary">SERVANA</p>
          <p className="mt-2 max-w-xs text-muted-foreground">
            Trusted beauty &amp; personal-care marketplace. Verified providers, transparent pricing, secure payments.
          </p>
        </div>
        <nav aria-label="Marketplace">
          <p className="font-semibold">Marketplace</p>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li><Link href="/explore" className="hover:text-foreground hover:underline">Explore services</Link></li>
            <li><Link href="/providers" className="hover:text-foreground hover:underline">Verified providers</Link></li>
            <li><Link href="/products" className="hover:text-foreground hover:underline">Beauty products</Link></li>
            <li><Link href="/rewards" className="hover:text-foreground hover:underline">Rewards</Link></li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <p className="font-semibold">Account</p>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li><Link href="/bookings" className="hover:text-foreground hover:underline">My bookings</Link></li>
            <li><Link href="/orders" className="hover:text-foreground hover:underline">My orders</Link></li>
            <li><Link href="/profile" className="hover:text-foreground hover:underline">Profile &amp; settings</Link></li>
            <li><Link href="/support" className="hover:text-foreground hover:underline">Help &amp; support</Link></li>
          </ul>
        </nav>
        <nav aria-label="Providers">
          <p className="font-semibold">Providers</p>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li><Link href="/provider/dashboard" className="hover:text-foreground hover:underline">Provider dashboard</Link></li>
            <li><Link href="/provider/services" className="hover:text-foreground hover:underline">Manage services</Link></li>
            <li><Link href="/provider/earnings" className="hover:text-foreground hover:underline">Earnings &amp; payouts</Link></li>
            <li><Link href="/admin/dashboard" className="hover:text-foreground hover:underline">Admin operations</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground">
          Payments are verified by the backend before any booking is confirmed. Verification badges and ratings reflect verified platform data only.
        </p>
      </div>
    </footer>
  );
}
