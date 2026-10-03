'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export const ADMIN_NAV = [
  { href: '/admin/dashboard', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/providers', label: 'Providers' },
  { href: '/admin/verifications', label: 'Verification' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/commissions', label: 'Commissions' },
  { href: '/admin/payouts', label: 'Payouts' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/loyalty', label: 'Loyalty' },
  { href: '/admin/promotions', label: 'Promotions' },
  { href: '/admin/disputes', label: 'Disputes' },
  { href: '/admin/fraud', label: 'Fraud' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/ai', label: 'AI' },
  { href: '/admin/audit', label: 'Audit Logs' },
  { href: '/admin/settings', label: 'Settings' },
];

/** Admin operations shell: information-dense but readable, horizontally scrollable nav. */
export function AdminShell({ children, title, description }: { children: React.ReactNode; title: string; description?: string }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin operations</p>
        <h1 className="type-h1 mt-1">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </header>
      <nav aria-label="Admin" className="mt-5 border-y py-2">
        <ul className="flex gap-1.5 overflow-x-auto">
          {ADMIN_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[36px] items-center rounded-md px-3 text-[13px] font-medium transition-micro',
                    active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-6 min-w-0">{children}</div>
    </div>
  );
}
