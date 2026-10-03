'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/providers/toast';
import { Badge } from '@/components/ui/badge';

interface Me {
  id: string;
  businessName?: string | null;
  slug?: string;
  tagline?: string | null;
  bio?: string | null;
  city?: string | null;
  country?: string;
  travelToCustomer?: boolean;
  verified?: boolean;
}

export default function ProviderProfilePage() {
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ businessName: '', tagline: '', bio: '', city: '', travelToCustomer: false });

  useEffect(() => {
    apiClient.get<Me>('/providers/me').then((res) => {
      if (res.error) setError(res.error.message);
      else if (res.data) {
        const d = res.data as Me;
        setMe(d);
        setForm({
          businessName: d.businessName ?? '',
          tagline: d.tagline ?? '',
          bio: d.bio ?? '',
          city: d.city ?? '',
          travelToCustomer: !!d.travelToCustomer,
        });
      }
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    const res = await apiClient.patch('/providers/me', {
      businessName: form.businessName || undefined,
      tagline: form.tagline || undefined,
      bio: form.bio || undefined,
      city: form.city || undefined,
      travelToCustomer: form.travelToCustomer,
    });
    setSaving(false);
    if (res.error) toast(res.error.message, 'error');
    else toast('Profile saved.', 'success');
  }

  return (
    <ProviderShell title="Profile" description="Your public mini-store identity — verification status is shown, never editable here.">
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && !loading && <ErrorState description={error} onRetry={() => window.location.reload()} />}
      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <section className="card-rest space-y-3 p-5">
            <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Business name</span><Input value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Tagline</span><Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="e.g. Bridal glam in Westlands" /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">About</span><textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} rows={4} className="rounded-md border border-input bg-background p-2.5" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">City</span><Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Nairobi" /></label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 pt-6 text-sm"><input type="checkbox" checked={form.travelToCustomer} onChange={(e) => setForm((f) => ({ ...f, travelToCustomer: e.target.checked }))} className="h-5 w-5 accent-primary" /> I travel to customers</label>
            </div>
            <Button onClick={save} disabled={saving} className="min-h-[48px] px-8">{saving ? 'Saving…' : 'Save profile'}</Button>
          </section>
          <aside className="card-rest h-fit p-5 text-sm">
            <p className="font-semibold">Verification</p>
            <p className="mt-2">{me?.verified ? <Badge variant="success">✓ Verified</Badge> : <Badge variant="warning">Pending verification</Badge>}</p>
            <p className="mt-2 text-muted-foreground">Documents are reviewed by admins — never shown publicly.</p>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => (window.location.href = '/provider/verification')}>Go to verification</Button>
            {me?.slug && <a href={`/providers/${me.slug}`} className="mt-2 block text-center text-sm text-primary hover:underline">View public profile</a>}
          </aside>
        </div>
      )}
    </ProviderShell>
  );
}
