'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { Rating } from '@/components/ui/rating';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast';

interface Review {
  id: string;
  overall: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  response?: { body: string } | null;
}

export default function ProviderReviewsPage() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    const me = await apiClient.get<{ id: string }>('/providers/me');
    if (me.error || !me.data) {
      setError(me.error?.message ?? 'Could not load your provider profile.');
      setLoading(false);
      return;
    }
    const pid = (me.data as { id: string }).id;
    const res = await apiClient.get<{ data: { data: Review[] } } | { data: Review[] }>(`/reviews/provider/${pid}?pageSize=20`);
    if (res.error) setError(res.error.message);
    else {
      const raw = res.data as { data: { data: Review[] } | Review[] } | null;
      const inner = (raw as { data?: unknown })?.data;
      setReviews(Array.isArray(inner) ? (inner as Review[]) : ((inner as { data?: Review[] })?.data ?? []));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(id: string) {
    if (!reply.trim()) {
      toast('Write a response first.', 'error');
      return;
    }
    const res = await apiClient.patch(`/reviews/${id}/respond`, { body: reply.trim() });
    if (res.error) toast(res.error.message, 'error');
    else {
      toast('Response published.', 'success');
      setReplying(null);
      setReply('');
      load();
    }
  }

  const avg = reviews.length > 0 ? reviews.reduce((s, r) => s + r.overall, 0) / reviews.length : null;

  return (
    <ProviderShell title="Reviews" description="Verified reviews only — respond professionally; AI summaries never replace reading them.">
      {loading && <ListSkeleton rows={4} />}
      {error && !loading && <ErrorState description={error} onRetry={load} />}
      {!loading && !error && (
        <>
          <div className="card-rest flex items-center gap-4 p-5">
            <Rating value={avg} count={reviews.length} />
            <p className="text-sm text-muted-foreground">from verified, completed bookings</p>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/provider/performance')} className="ml-auto">
              AI performance summary
            </Button>
          </div>
          {reviews.length === 0 ? (
            <div className="mt-4"><EmptyState title="No reviews yet" description="Reviews appear after customers complete verified appointments." /></div>
          ) : (
            <ul className="mt-4 space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="card-rest p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Rating value={r.overall} showCount={false} />
                    <time className="text-xs text-muted-foreground" dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString()}</time>
                  </div>
                  {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                  {r.body && <p className="mt-1 text-sm">{r.body}</p>}
                  {r.response ? (
                    <p className="mt-2 rounded-md bg-muted/60 p-3 text-sm">Your response: {r.response.body}</p>
                  ) : replying === r.id ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} className="rounded-md border border-input bg-background p-2 text-sm" placeholder="Thank them, address concerns…" aria-label={`Respond to review ${r.id}`} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => respond(r.id)}>Publish</Button>
                        <Button size="sm" variant="ghost" onClick={() => setReplying(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setReplying(r.id)}>Respond</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ProviderShell>
  );
}
