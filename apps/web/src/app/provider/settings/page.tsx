import { ProviderShell } from '@/components/layout/provider-shell';
import Link from 'next/link';

export default function ProviderSettingsPage() {
  return (
    <ProviderShell title="Settings" description="Account and notification preferences for your provider workspace.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/account" className="card-rest p-5 transition-micro hover:border-primary/50">
          <p className="font-semibold">Account &amp; security</p>
          <p className="mt-1 text-sm text-muted-foreground">Password, sessions and privacy live with your customer account.</p>
        </Link>
        <Link href="/notifications" className="card-rest p-5 transition-micro hover:border-primary/50">
          <p className="font-semibold">Notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">Booking requests, reminders, payouts and reviews.</p>
        </Link>
      </div>
    </ProviderShell>
  );
}
