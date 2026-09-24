'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/api';

interface Criteria {
  service: string | null;
  location: string | null;
  date: string | null;
  budget: number | null;
  preferences: string[];
}

interface Match {
  providerId: string;
  businessName: string | null;
  slug: string;
  serviceName: string;
  priceCents: string;
  score: number;
  reasons: string[];
  likelyAvailable: boolean | null;
}

interface Explain {
  summary: string;
  evidence: string[];
}

interface ChatTurn {
  from: 'you' | 'ai';
  text: string;
  confirmation?: { action: string; message: string };
}

export default function AssistantPage() {
  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [query, setQuery] = useState('I need a makeup artist tomorrow in Nairobi under KSh 3,000.');
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [results, setResults] = useState<Match[]>([]);
  const [explanations, setExplanations] = useState<Record<string, Explain>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');

  async function search() {
    if (query.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setExplanations({});
    const res = await apiClient.post<{ criteria: Criteria; results: Match[] }>('/ai/match', { query, limit: 5 });
    setLoading(false);
    if (res.error) setError(res.error.message);
    else {
      const d = res.data as { criteria: Criteria; results: Match[] };
      setCriteria(d.criteria);
      setResults(d.results ?? []);
    }
  }

  async function explain(providerId: string) {
    const res = await apiClient.post<Explain>('/ai/recommend/explain', { itemType: 'provider', itemId: providerId });
    if (!res.error && res.data) {
      setExplanations((prev) => ({ ...prev, [providerId]: res.data as Explain }));
    }
  }

  async function sendChat() {
    if (draft.trim().length < 1 || loading) return;
    const text = draft.trim();
    setDraft('');
    setError(null);
    setTurns((prev) => [...prev, { from: 'you', text }]);
    setLoading(true);
    const res = await apiClient.post<{ message: string; confirmationRequired?: { action: string; message: string } }>(
      '/ai/assistant/chat',
      { message: text },
    );
    setLoading(false);
    if (res.error) setError(res.error.message);
    else {
      const d = res.data as { message: string; confirmationRequired?: { action: string; message: string } };
      setTurns((prev) => [...prev, { from: 'ai', text: d.message, confirmation: d.confirmationRequired }]);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Find your match</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe what you need — every recommendation comes from verified marketplace providers, never invented.
      </p>
      <div className="mt-4 flex gap-2">
        {(['search', 'chat'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${mode === m ? 'bg-primary text-primary-foreground' : 'border'}`}
          >
            {m === 'search' ? 'Smart search' : 'Ask AI'}
          </button>
        ))}
      </div>

      {mode === 'chat' ? (
        <div className="mt-4">
          <div className="space-y-3 rounded-lg border bg-card p-4">
            {turns.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask about services, bookings, or support — e.g. “What is my booking status?” The assistant prepares
                bookings and payments but never completes them without your confirmation.
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`rounded-md p-3 text-sm ${t.from === 'you' ? 'bg-muted' : 'border'}`}>
                <p className="whitespace-pre-line">{t.text}</p>
                {t.confirmation && (
                  <p className="mt-2 rounded bg-yellow-50 p-2 text-xs text-yellow-800">
                    Confirmation needed ({t.confirmation.action}): {t.confirmation.message} Complete it from
                    your bookings page — the assistant never acts alone.
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder="Ask about services, bookings, support…"
              maxLength={2000}
              className="h-11 flex-1 rounded-md border px-3 text-sm"
            />
            <button
              onClick={sendChat}
              disabled={loading}
              className="h-11 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? 'Thinking…' : 'Send'}
            </button>
          </div>
        </div>
      ) : (
      <>
      <div className="mt-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder='Try "braids on Saturday in Kileleshwa under 2500"'
          maxLength={500}
          className="h-11 flex-1 rounded-md border px-3 text-sm"
        />
        <button
          onClick={search}
          disabled={loading}
          className="h-11 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
      </>
      )}

      {mode === 'search' && (
      <>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {criteria && (
        <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {criteria.service && <span className="rounded-full bg-muted px-2.5 py-1">Service: {criteria.service}</span>}
          {criteria.location && <span className="rounded-full bg-muted px-2.5 py-1">Area: {criteria.location}</span>}
          {criteria.date && <span className="rounded-full bg-muted px-2.5 py-1">Date: {criteria.date}</span>}
          {criteria.budget != null && (
            <span className="rounded-full bg-muted px-2.5 py-1">Budget: {formatPrice(criteria.budget * 100)}</span>
          )}
          {criteria.preferences.map((p) => (
            <span key={p} className="rounded-full bg-muted px-2.5 py-1">{p}</span>
          ))}
        </div>
      )}

      {!loading && criteria && results.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No verified providers match that combination right now. Try widening the budget or area.
        </p>
      )}

      <ul className="mt-6 space-y-4">
        {results.map((r) => (
          <li key={r.providerId} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/providers/${r.slug}`} className="font-semibold hover:underline">
                  {r.businessName ?? 'Provider'}
                </Link>
                <p className="text-sm text-muted-foreground">{r.serviceName} · {formatPrice(r.priceCents)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Score {r.score.toFixed(1)} · {r.reasons.join(' · ')}
                  {r.likelyAvailable === true && ' · likely available'}
                </p>
              </div>
            </div>
            {explanations[r.providerId] ? (
              <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{explanations[r.providerId].summary}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {explanations[r.providerId].evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <button onClick={() => explain(r.providerId)} className="mt-2 text-xs text-primary underline">
                Why this provider?
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
