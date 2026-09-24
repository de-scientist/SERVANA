'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface RankingComponent {
  name: string;
  rawValue: number;
  normalizedScore: number;
  weight: number;
  weightedScore: number;
  confidence: number;
}

interface PerformanceDashboard {
  ranking: {
    providerId: string;
    qualityScore: number;
    components: RankingComponent[];
    computedAt: string;
  };
  signals: {
    overallRating: number;
    totalReviews: number;
    completedJobs: number;
    repeatRate: number;
    cancellationRate: number;
    responseRate: number;
    onTimeRate: number;
    verificationLevel: string | null;
    verificationScore: number;
    profileCompleteness: number;
    totalCustomers: number;
    totalBookings: number;
  };
  trustSignals: {
    rating: number;
    customersServed: number;
    completionRate: number;
    responseRate: number;
    verified: boolean;
  };
  insights: {
    strengths: string[];
    improvements: string[];
    dimensionAverages: Record<string, number>;
  };
}

export default function ProviderPerformancePage() {
  const [dashboard, setDashboard] = useState<PerformanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const me = await apiClient.get<{ id: string }>('/providers/me');
      if (me.error || !me.data) {
        setError(me.error?.message ?? 'Could not load your provider profile.');
        setLoading(false);
        return;
      }
      const profileId = (me.data as { id: string }).id;
      const res = await apiClient.get<PerformanceDashboard>(`/ranking/providers/${profileId}/dashboard`);
      if (res.error) setError(res.error.message);
      else setDashboard(res.data as PerformanceDashboard);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading performance insights…</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold">Performance</h1>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </main>
    );
  }
  if (!dashboard) return null;

  const bar = (value: number) => (
    <div className="mt-1 h-2 w-full rounded-full bg-muted">
      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Performance</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Quality score {dashboard.ranking.qualityScore.toFixed(1)} / 100 · computed from verified bookings and reviews.
      </p>

      <section aria-label="Trust signals" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{dashboard.trustSignals.rating > 0 ? `${dashboard.trustSignals.rating.toFixed(1)} ★` : 'New'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{dashboard.signals.totalReviews} verified reviews</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{dashboard.trustSignals.customersServed.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">customers served</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{Math.round(dashboard.trustSignals.completionRate * 100)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">completion rate</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{Math.round(dashboard.trustSignals.responseRate * 100)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">response rate</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{dashboard.trustSignals.verified ? 'Verified' : 'Unverified'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{dashboard.signals.verificationLevel?.replace(/_/g, ' ').toLowerCase() ?? 'not verified'}</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Score breakdown</h2>
        <ul className="mt-3 space-y-3">
          {dashboard.ranking.components.map((c) => (
            <li key={c.name} className="rounded-lg border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">
                  {c.normalizedScore.toFixed(1)} / 100 · weight {Math.round(c.weight * 100)}%
                </p>
              </div>
              {bar(c.normalizedScore)}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Strengths</h2>
          {dashboard.insights.strengths.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Complete more verified bookings to build strengths.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {dashboard.insights.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Improvements</h2>
          {dashboard.insights.improvements.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing flagged right now. Keep it up.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {dashboard.insights.improvements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {Object.keys(dashboard.insights.dimensionAverages).length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Review dimensions</h2>
          <p className="mt-1 text-sm text-muted-foreground">Averages from verified customer reviews.</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(dashboard.insights.dimensionAverages).map(([name, avg]) => (
              <div key={name} className="rounded-lg border bg-card p-4">
                <dt className="text-xs text-muted-foreground">{name}</dt>
                <dd className="mt-1 text-xl font-bold">{avg.toFixed(1)} / 5</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </main>
  );
}
