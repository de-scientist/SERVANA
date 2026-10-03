import { ProviderShell } from '@/components/layout/provider-shell';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';

export default function ProviderProductsPage() {
  return (
    <ProviderShell title="Products" description="Mini-store products linked to your services for cross-selling.">
      <EmptyState
        title="No mini-store products yet"
        description="Products you list here can be recommended alongside your services (e.g. aftercare). Manage catalogue from the shop admin or contact support."
        actionLabel="View shop"
        actionHref="/products"
      />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Service cross-sell is live on <Link href="/search" className="text-primary hover:underline">service pages</Link>.
      </p>
    </ProviderShell>
  );
}
