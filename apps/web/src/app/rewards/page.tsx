'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

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

export default function RewardsPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [history, setHistory] = useState<Txn[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [claim, setClaim] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [a, h, r, c] = await Promise.all([
      apiClient.get<Account>('/loyalty/account'),
      apiClient.get<{ data: Txn[] }>('/loyalty/history'),
      apiClient.get<Reward[]>('/rewards'),
      apiClient.get<{ code: string }>('/referrals/code'),
    ]);
    if (a.data) setAccount(a.data as Account);
    if (h.data) {
      const d = h.data as unknown as { data: Txn[] } | Txn[];
      setHistory(Array.isArray(d) ? d : d.data ?? []);
    }
    if (r.data) setRewards(r.data as Reward[]);
    if (c.data) setCode((c.data as { code: string }).code);
    if (a.error) setError(a.error.message);
  }

  useEffect(() => {
    refresh();
  }, []);

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

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Rewards</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm">{message}</p>}

      {account && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Points balance</p>
            <p className="mt-1 text-2xl font-bold">{account.balance}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Tier</p>
            <p className="mt-1 text-2xl font-bold">{account.tier.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{account.lifetime} lifetime points</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Your referral code</p>
            <p className="mt-1 text-2xl font-bold">{code ?? '…'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Earn 50 points per friend&apos;s first booking</p>
          </div>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Have a referral code?</h2>
        <div className="mt-2 flex max-w-md gap-2">
          <input
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="SVN-XXXXXX"
            className="h-10 flex-1 rounded-md border px-3 text-sm uppercase"
          />
          <button onClick={claimCode} className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">
            Apply
          </button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Redeem rewards</h2>
        {rewards.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No rewards available right now.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-4">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-sm text-muted-foreground">{r.cost} points</p>
                </div>
                <button
                  onClick={() => redeem(r.id)}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                >
                  Redeem
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Points history</h2>
        <p className="mt-1 text-xs text-muted-foreground">Every points movement is recorded — balances are never edited directly.</p>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No activity yet. Book a service to earn points.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
                <div>
                  <p className="font-medium">{t.type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">{t.reason}</p>
                </div>
                <p className={`font-bold ${t.points.startsWith('-') ? 'text-red-600' : 'text-green-700'}`}>
                  {t.points.startsWith('-') ? '' : '+'}{t.points}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {account && account.tiers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Tiers</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-6">
            {account.tiers.map((t) => (
              <div
                key={t.id}
                className={`rounded-lg border p-3 text-center ${t.id === account.tier.id ? 'border-primary bg-primary/5' : 'bg-card'}`}
              >
                <p className="text-sm font-bold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.threshold}+ pts</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
