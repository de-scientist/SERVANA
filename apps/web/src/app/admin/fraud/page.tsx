'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface Alert {
  id: string;
  checkKey: string;
  entityType: string;
  entityId: string;
  score: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  evidence: Record<string, unknown>;
  recommendedAction: string | null;
  status: string;
  reviewedBy: string | null;
  createdAt: string | null;
}

export default function AdminFraudPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [selected, setSelected] = useState<Alert | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(status: string) {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<{ data: Alert[] }>(`/admin/fraud/alerts?status=${status}`);
    if (res.error) setError(res.error.message);
    else {
      const d = res.data as unknown as { data: Alert[] } | Alert[];
      setAlerts(Array.isArray(d) ? d : d.data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function scan() {
    setScanning(true);
    setError(null);
    const res = await apiClient.post('/admin/fraud/scan', { days: 30 });
    setScanning(false);
    if (res.error) setError(res.error.message);
    else load(statusFilter);
  }

  async function review(id: string, status: 'REVIEWED' | 'FALSE_POSITIVE' | 'ACTIONED') {
    if (status === 'ACTIONED' && note.trim().length < 5) {
      setError('ACTIONED requires a note describing the action you took.');
      return;
    }
    const res = await apiClient.post(`/admin/fraud/alerts/${id}/review`, { status, note });
    if (res.error) setError(res.error.message);
    else {
      setSelected(null);
      setNote('');
      load(statusFilter);
    }
  }

  const badge = (level: string) => {
    const colors: Record<string, string> = {
      HIGH: 'bg-red-100 text-red-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      LOW: 'bg-gray-100 text-gray-800',
    };
    return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[level] ?? 'bg-muted'}`}>{level}</span>;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Risk queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Risk signals only — nothing here punishes anyone automatically. Every decision is audited.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {scanning ? 'Scanning…' : 'Run scan'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        {['OPEN', 'REVIEWED', 'FALSE_POSITIVE', 'ACTIONED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'border'}`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : alerts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No alerts in this state. Run a scan to check the trailing 30 days.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {a.checkKey} <span className="text-sm font-normal text-muted-foreground">· {a.entityType} {a.entityId.slice(0, 8)}…</span>
                  </p>
                  <p className="mt-1 text-sm">{a.reason}</p>
                  {a.recommendedAction && (
                    <p className="mt-1 text-xs text-muted-foreground">Suggested: {a.recommendedAction}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {badge(a.riskLevel)}
                  <span className="text-sm font-bold">{a.score}</span>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setSelected(selected?.id === a.id ? null : a)}
                  className="rounded-md border px-3 py-1.5 text-xs"
                >
                  {selected?.id === a.id ? 'Hide evidence' : 'View evidence'}
                </button>
                {(a.status === 'OPEN' || a.status === 'REVIEWED') && (
                  <>
                    <button onClick={() => review(a.id, 'FALSE_POSITIVE')} className="rounded-md border px-3 py-1.5 text-xs">
                      False positive
                    </button>
                    <button onClick={() => review(a.id, 'REVIEWED')} className="rounded-md border px-3 py-1.5 text-xs">
                      Mark reviewed
                    </button>
                  </>
                )}
              </div>
              {selected?.id === a.id && (
                <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs">
                  <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(a.evidence, null, 2)}</pre>
                  {(a.status === 'OPEN' || a.status === 'REVIEWED') && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Action taken (required to close as ACTIONED)…"
                        className="h-9 flex-1 rounded-md border bg-background px-3"
                      />
                      <button onClick={() => review(a.id, 'ACTIONED')} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                        Close as actioned
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
