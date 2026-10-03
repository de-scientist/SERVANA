import Link from 'next/link';
import { ProviderShell } from '@/components/layout/provider-shell';

export default function ProviderAnalyticsPage() {
  return (
    <ProviderShell title="Analytics" description="Performance that supports decisions — quality score, trends and repeat business.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/provider/performance" className="card-rest p-5 transition-micro hover:border-primary/50">
          <p className="font-semibold">Quality score breakdown</p>
          <p className="mt-1 text-sm text-muted-foreground">Rating, completion, repeat rate, response &amp; verification — confidence-adjusted.</p>
        </Link>
        <Link href="/provider/reviews" className="card-rest p-5 transition-micro hover:border-primary/50">
          <p className="font-semibold">Review dimensions</p>
          <p className="mt-1 text-sm text-muted-foreground">Quality, professionalism, communication, punctuality, value.</p>
        </Link>
      </div>
      <p className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
        Charts appear only where they improve comprehension — no decorative dashboards. Demand and repeat-customer trends build as you complete verified bookings.
      </p>
    </ProviderShell>
  );
}
