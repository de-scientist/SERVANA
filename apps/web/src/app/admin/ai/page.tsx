'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface Usage {
  requests: number;
  totalCostCents: string;
  byFeature: { feature: string; requests: number; inputTokens: number; outputTokens: number; costCents: string; blocked: number; failed: number }[];
}

interface Proposal {
  id: string;
  kind: string;
  payload: unknown;
  reason: string | null;
  status: string;
  sensitive: boolean;
  createdAt: string;
}

export default function AdminAIPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [u, p] = await Promise.all([
      apiClient.get<Usage>('/admin/ai/usage'),
      apiClient.get<Proposal[]>(`/admin/ai/actions${statusFilter ? `?status=${statusFilter}` : ''}`),
    ]);
    if (u.error) setError(u.error.message);
    else setUsage(u.data as Usage);
    if (p.error) setError(p.error.message);
    else setProposals((p.data as Proposal[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function review(id: string, decision: 'APPROVE' | 'REJECT') {
    const res = await apiClient.post(`/admin/ai/actions/${id}/review`, { decision });
    if (res.error) setError(res.error.message);
    else load();
  }

  async function execute(id: string) {
    const res = await apiClient.post(`/admin/ai/actions/${id}/execute`, {});
    if (res.error) setError(res.error.message);
    else load();
  }

  const badge = (status: string) => {
    const colors: Record<string, string> = {
      PROPOSED: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-blue-100 text-blue-800',
      REJECTED: 'bg-gray-100 text-gray-800',
      EXECUTED: 'bg-green-100 text-green-800',
      REFUSED: 'bg-red-100 text-red-800',
    };
    return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-muted'}`}>{status}</span>;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold">AI oversight</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Model usage, cost, and the human-confirmation queue. Sensitive actions never execute from AI context.
      </p>

      {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {usage && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Usage &amp; cost</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Requests</p>
              <p className="mt-1 text-xl font-bold">{usage.requests}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Estimated cost</p>
              <p className="mt-1 text-xl font-bold">KES {(Number(usage.totalCostCents) / 100).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Blocked / failed</p>
              <p className="mt-1 text-xl font-bold">
                {usage.byFeature.reduce((s, f) => s + f.blocked, 0)} / {usage.byFeature.reduce((s, f) => s + f.failed, 0)}
              </p>
            </div>
          </div>
          {usage.byFeature.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Feature</th>
                    <th className="p-2 text-right">Requests</th>
                    <th className="p-2 text-right">Tokens in/out</th>
                    <th className="p-2 text-right">Cost (KES)</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byFeature.map((f) => (
                    <tr key={f.feature} className="border-b">
                      <td className="p-2">{f.feature}</td>
                      <td className="p-2 text-right">{f.requests}</td>
                      <td className="p-2 text-right">{f.inputTokens.toLocaleString()} / {f.outputTokens.toLocaleString()}</td>
                      <td className="p-2 text-right">{(Number(f.costCents) / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Action proposals</h2>
          <div className="flex gap-2">
            {['', 'PROPOSED', 'APPROVED', 'EXECUTED', 'REFUSED', 'REJECTED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'border'}`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>
        {proposals.length === 0 && !loading && (
          <p className="mt-3 text-sm text-muted-foreground">No proposals in this state.</p>
        )}
        <ul className="mt-3 space-y-3">
          {proposals.map((p) => (
            <li key={p.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {p.kind} {p.sensitive && <span className="text-xs text-red-600">(sensitive)</span>}
                  </p>
                  {p.reason && <p className="text-sm text-muted-foreground">{p.reason}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</p>
                </div>
                {badge(p.status)}
              </div>
              {p.status === 'PROPOSED' && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => review(p.id, 'APPROVE')} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                    Approve
                  </button>
                  <button onClick={() => review(p.id, 'REJECT')} className="rounded-md border px-3 py-1.5 text-xs">
                    Reject
                  </button>
                </div>
              )}
              {p.status === 'APPROVED' && (
                <div className="mt-3">
                  <button onClick={() => execute(p.id)} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                    Execute
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
