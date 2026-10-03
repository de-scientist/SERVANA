'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, ShoppingBag, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

const DESKTOP_LINKS = [
  { href: '/explore', label: 'Explore' },
  { href: '/providers', label: 'Providers' },
  { href: '/products', label: 'Products' },
  { href: '/rewards', label: 'Rewards' },
];

/** Lightweight, responsive global header. Mobile menu is a disclosure, not a heavy drawer. */
export function SiteHeader({ cartCount = 0 }: { cartCount?: number }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="mr-1 text-lg font-extrabold tracking-tight text-primary" aria-label="SERVANA home">
          SERVANA
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Primary">
          {DESKTOP_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 font-medium text-muted-foreground transition-micro hover:bg-muted hover:text-foreground',
                pathname === l.href && 'bg-muted text-foreground',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/search"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href="/cart"
            className="relative inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : 'Cart'}
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </Link>
          <Link
            href="/provider/dashboard"
            className="hidden min-h-[40px] items-center rounded-md border px-3 text-sm font-medium transition-micro hover:bg-muted lg:inline-flex"
          >
            Become a provider
          </Link>
          <Link
            href="/profile"
            className="hidden min-h-[40px] items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-micro hover:opacity-90 sm:inline-flex"
          >
            Account
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[40px] min-w-[40px] md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <nav className="border-t bg-background px-4 py-3 md:hidden" aria-label="Mobile">
          <ul className="grid gap-1 text-[15px]">
            {[...DESKTOP_LINKS, { href: '/bookings', label: 'My bookings' }, { href: '/profile', label: 'Account' }].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    'flex min-h-[44px] items-center rounded-md px-3 font-medium text-foreground hover:bg-muted',
                    pathname === l.href && 'bg-muted',
                  )}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/provider/dashboard"
                className="flex min-h-[44px] items-center rounded-md px-3 font-medium text-primary hover:bg-muted"
              >
                Become a provider
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
