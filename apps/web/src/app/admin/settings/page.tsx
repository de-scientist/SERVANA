import { AdminShell } from '@/components/layout/admin-shell';

export default function AdminSettingsPage() {
  return (
    <AdminShell title="Settings" description="Commission defaults, loyalty rules, ranking weights and cancellation windows — no hardcoded business rules.">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Commission engine', 'Standard / premium / promotional tiers per category or provider.'],
          ['Loyalty rules', 'Earning, expiry, redemption and referral bonuses.'],
          ['Ranking weights', 'Rating 30 · completed 20 · repeat 15 · cancellations 10 · response 10 · on-time 10 · verification 5.'],
          ['Cancellation windows', 'Customer and provider cut-offs with refund behaviour.'],
        ].map(([title, text]) => (
          <section key={title} className="card-rest p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
