'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Verification {
  level?: string | null;
  status?: string;
  verified?: boolean;
  documents?: { id: string; type: string; status: string }[];
}

/** KYC submission — sensitive documents stay private, status is transparent. */
export default function ProviderVerificationPage() {
  const [data, setData] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiClient.get<Verification>('/providers/me/verification');
    if (res.error) setError(res.error.message);
    else setData(res.data as Verification);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setSubmitting(true);
    const res = await apiClient.post('/providers/me/verification/submit', {});
    setSubmitting(false);
    if (res.error) setError(res.error.message);
    else load();
  }

  return (
    <ProviderShell title="Verification" description="Identity and professional checks. Documents are never exposed publicly.">
      {loading && <ListSkeleton rows={3} />}
      {error && !loading && <ErrorState description={error} onRetry={load} />}
      {!loading && !error && (
        <>
          <div className="card-rest p-5">
            <p className="text-sm text-muted-foreground">Current level</p>
            <p className="mt-1 text-xl font-bold">{data?.verified ? '✓ Verified' : 'In review'} {data?.level ? `· ${String(data.level).replace(/_/g, ' ').toLowerCase()}` : ''}</p>
            {data?.status && <p className="mt-1"><Badge variant="info">{data.status}</Badge></p>}
          </div>
          {(data?.documents ?? []).length > 0 && (
            <ul className="mt-3 space-y-2">
              {(data?.documents ?? []).map((d) => (
                <li key={d.id} className="card-rest flex items-center justify-between p-3.5 text-sm">
                  <span className="font-medium">{d.type}</span>
                  <Badge variant={d.status === 'APPROVED' ? 'success' : 'warning'}>{d.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          {(data?.documents ?? []).length === 0 && (
            <div className="mt-3"><EmptyState title="No documents submitted" description="Upload ID and professional certificates to unlock the Verified badge." /></div>
          )}
          <Button onClick={submit} disabled={submitting} className="mt-4 min-h-[48px] px-8">
            {submitting ? 'Submitting…' : 'Submit for review'}
          </Button>
        </>
      )}
    </ProviderShell>
  );
}
