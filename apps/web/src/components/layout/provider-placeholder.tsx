import { ProviderShell } from '@/components/layout/provider-shell';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';

function Page({ title, description, body, action }: { title: string; description: string; body: string; action?: { label: string; href: string } }) {
  return (
    <ProviderShell title={title} description={description}>
      <EmptyState title={body} description="This section is being completed — your data remains safe and nothing here is fabricated." actionLabel={action?.label} actionHref={action?.href} />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Related: <Link href="/provider/dashboard" className="text-primary hover:underline">Dashboard</Link> ·{' '}
        <Link href="/provider/bookings" className="text-primary hover:underline">Bookings</Link>
      </p>
    </ProviderShell>
  );
}

export function ProviderPlaceholderPage(props: { title: string; description: string; body: string }) {
  return <Page {...props} />;
}
