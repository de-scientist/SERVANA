'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export const PROVIDER_NAV = [
  { href: '/provider/dashboard', label: 'Dashboard' },
  { href: '/provider/bookings', label: 'Bookings' },
  { href: '/provider/services', label: 'Services' },
  { href: '/provider/availability', label: 'Availability' },
  { href: '/provider/customers', label: 'Customers' },
  { href: '/provider/earnings', label: 'Earnings' },
  { href: '/provider/reviews', label: 'Reviews' },
  { href: '/provider/products', label: 'Products' },
  { href: '/provider/analytics', label: 'Analytics' },
  { href: '/provider/ai', label: 'AI Tools' },
  { href: '/provider/profile', label: 'Profile' },
  { href: '/provider/settings', label: 'Settings' },
];

/** Provider workspace shell: prioritises Dashboard/Bookings/Services/Earnings on mobile. */
export function ProviderShell({ children, title, description }: { children: React.ReactNode; title: string; description?: string }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Provider workspace</p>
        <h1 className="type-h1 mt-1">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Provider" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible">
            {PROVIDER_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[40px] items-center rounded-md px-3 text-sm font-medium transition-micro',
                      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
