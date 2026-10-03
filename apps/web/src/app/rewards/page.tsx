'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Breadcrumb } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Tier {
  id: string;
  name: string;
  threshold: string;
}

interface Account {
  balance: string;
  lifetime: string;
  tier: { id: string; name: string };
  tiers: Tier[];
}

interface Txn {
  id: string;
  type: string;
  points: string;
  reason: string;
  createdAt: string;
}

interface Reward {
  id: string;
  name: string;
  cost: string;
}

/** Loyalty page — visual progress without casino aesthetics; ledger-backed balances only. */
export default function RewardsPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [history, setHistory] = useState<Txn[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [claim, setClaim] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [a, h, r, c] = await Promise.all([
      apiClient.get<Account>('/loyalty/account'),
      apiClient.get<{ data: Txn[] } | Txn[]>('/loyalty/history'),
      apiClient.get<Reward[] | { data: Reward[] }>('/rewards'),
      apiClient.get<{ code: string }>('/referrals/code'),
    ]);
    if (a.data) setAccount(a.data as Account);
    if (h.data) {
      const d = h.data as { data: Txn[] } | Txn[];
      setHistory(Array.isArray(d) ? d : (d.data ?? []));
    }
    if (r.data) {
      const d = r.data as Reward[] | { data: Reward[] };
      setRewards(Array.isArray(d) ? d : (d.data ?? []));
    }
    if (c.data) setCode((c.data as { code: string }).code);
    if (a.error) setError(a.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function redeem(rewardId: string) {
    setMessage(null);
    setError(null);
    const res = await apiClient.post<{ voucher: string }>('/loyalty/redeem', { rewardId });
    if (res.error) setError(res.error.message);
    else {
      setMessage(`Reward redeemed! Voucher: ${(res.data as { voucher: string }).voucher}`);
      refresh();
    }
  }

  async function claimCode() {
    setMessage(null);
    setError(null);
    const res = await apiClient.post('/referrals/claim', { code: claim });
    if (res.error) setError(res.error.message);
    else {
      setMessage('Referral code applied — complete your first booking to unlock rewards.');
      setClaim('');
    }
  }

  const balance = Number(account?.balance ?? 0);
  const tiers = account?.tiers ?? [];
  const currentIdx = tiers.findIndex((t) => t.id === account?.tier.id);
  const next = currentIdx >= 0 ? tiers[currentIdx + 1] : undefined;
  const progress = next ? Math.min(100, (balance / Math.max(1, Number(next.threshold))) * 100) : 100;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Rewards' }]} />
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-primary">Loyalty</p>
      <h1 className="type-h1 mt-1">Rewards</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Earn points for bookings, reviews and referrals. Every movement is ledger-recorded.</p>

      {message && <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm dark:bg-emerald-900/20" role="status">{message}</p>}
      {error && !loading && <div className="mt-4"><ErrorState description={error} onRetry={refresh} /></div>}

      {loading ? (
        <div className="mt-6"><ListSkeleton rows={3} /></div>
      ) : account ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="card-rest p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Points balance</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{account.balance}</p>
              <p className="mt-1 text-xs text-muted-foreground">{account.lifetime} lifetime points</p>
            </div>
            <div className="card-rest p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current tier</p>
              <p className="mt-1 text-3xl font-bold">{account.tier.name}</p>
              {next ? (
                <>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to ${next.name}`}>
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{Number(next.threshold) - balance} pts to {next.name}</p>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Top tier — thank you for your loyalty.</p>
              )}
            </div>
            <div className="card-rest p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your referral code</p>
              <p className="mt-1 font-mono text-2xl font-bold">{code ?? '…'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Earn 50 points per friend&apos;s first booking.</p>
            </div>
          </div>

          <section className="card-rest mt-5 p-5" aria-labelledby="claim-h">
            <h2 id="claim-h" className="font-semibold">Have a referral code?</h2>
            <div className="mt-2.5 flex max-w-md gap-2">
              <Input value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="SVN-XXXXXX" className="uppercase" aria-label="Referral code" />
              <Button onClick={claimCode}>Apply</Button>
            </div>
          </section>

          <section className="mt-8" aria-labelledby="redeem-h">
            <h2 id="redeem-h" className="type-h3">Available rewards</h2>
            {rewards.length === 0 ? (
              <div className="mt-3"><EmptyState title="No rewards right now" description="Keep earning — new rewards appear here." /></div>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {rewards.map((r) => {
                  const affordable = balance >= Number(r.cost);
                  return (
                    <li key={r.id} className="card-rest flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-semibold">{r.name}</p>
                        <p className="text-sm tabular-nums text-muted-foreground">{r.cost} points</p>
                      </div>
                      <Button onClick={() => redeem(r.id)} disabled={!affordable} size="sm" title={affordable ? 'Redeem reward' : 'Not enough points yet'}>
                        Redeem
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-8" aria-labelledby="history-h">
            <h2 id="history-h" className="type-h3">Points history</h2>
            <p className="mt-1 text-xs text-muted-foreground">Balances are never edited directly — each line is a ledger transaction.</p>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No activity yet. Book a service to earn points.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {history.map((t) => (
                  <li key={t.id} className="card-rest flex items-center justify-between gap-3 p-3.5 text-sm">
                    <div>
                      <p className="font-medium">{t.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">{t.reason} · {new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                    <p className={`font-bold tabular-nums ${t.points.startsWith('-') ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'}`}>
                      {t.points.startsWith('-') ? '' : '+'}{t.points}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {tiers.length > 0 && (
            <section className="mt-8" aria-labelledby="tiers-h">
              <h2 id="tiers-h" className="type-h3">Tiers</h2>
              <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                {tiers.map((t) => (
                  <li key={t.id} className={`rounded-xl border p-3 text-center ${t.id === account.tier.id ? 'border-primary bg-primary/5' : 'bg-card'}`} aria-current={t.id === account.tier.id ? 'true' : undefined}>
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{t.threshold}+ pts</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
