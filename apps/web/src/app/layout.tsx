import type { Metadata } from 'next';
import Link from 'next/link';
import { AppProviders } from '@/components/providers/app-providers';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'SERVANA — Beauty & Personal Care Marketplace',
  description:
    'Discover, book and pay verified beauty & personal-care providers. Shop products, earn rewards.',
  openGraph: {
    title: 'SERVANA',
    description: 'AI-powered marketplace for beauty & personal-care services.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-background">
          <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="font-bold text-primary">
              SERVANA
            </Link>
            <Link href="/search" className="text-muted-foreground hover:text-foreground">
              Search
            </Link>
            <Link href="/bookings" className="text-muted-foreground hover:text-foreground">
              My bookings
            </Link>
            <Link href="/products" className="text-muted-foreground hover:text-foreground">
              Shop
            </Link>
            <Link href="/cart" className="text-muted-foreground hover:text-foreground">
              Cart
            </Link>
            <Link href="/orders" className="text-muted-foreground hover:text-foreground">
              Orders
            </Link>
            <Link href="/rewards" className="text-muted-foreground hover:text-foreground">
              Rewards
            </Link>
            <Link href="/earnings" className="text-muted-foreground hover:text-foreground">
              Earnings
            </Link>
            <Link href="/admin/payouts" className="text-muted-foreground hover:text-foreground">
              Payouts
            </Link>
          </nav>
        </header>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
