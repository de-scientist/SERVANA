'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderShell } from '@/components/layout/provider-shell';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/providers/toast';

interface Service {
  id: string;
  name: string;
  priceCents?: string;
  price?: number;
  currency?: string;
  durationMin?: number;
  isActive?: boolean;
  status?: string;
}

/** Clean service management: create / edit / activate / deactivate. Duplicate via create. */
export default function ProviderServicesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('60');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<{ data: Service[] } | Service[]>('/providers/me/services');
    if (res.error) setError(res.error.message);
    else {
      const raw = res.data as { data: Service[] } | Service[] | null;
      setItems(Array.isArray(raw) ? raw : (raw?.data ?? []));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!name.trim()) {
      toast('Give the service a name first.', 'error');
      return;
    }
    setCreating(true);
    const res = await apiClient.post<Service>('/providers/me/services', {
      name: name.trim(),
      priceCents: price ? String(Math.round(Number(price) * 100)) : undefined,
      durationMin: Number(duration) || 60,
    });
    setCreating(false);
    if (res.error) {
      toast(res.error.message, 'error');
      return;
    }
    setName('');
    setPrice('');
    toast('Service created.', 'success');
    load();
  }

  async function toggle(s: Service) {
    const next = !(s.isActive ?? s.status !== 'INACTIVE');
    const res = await apiClient.patch(`/providers/me/services/${s.id}`, {
      isActive: !next ? true : false,
      status: next ? 'INACTIVE' : 'ACTIVE',
    });
    if (res.error) toast(res.error.message, 'error');
    else {
      toast(next ? 'Service deactivated.' : 'Service activated.', 'success');
      load();
    }
  }

  return (
    <ProviderShell title="Services" description="Create, edit, duplicate, activate and deactivate what customers can book.">
      <section className="card-rest p-5" aria-labelledby="new-service">
        <h2 id="new-service" className="font-semibold">New service</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_120px_auto]">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Box braids with wash" aria-label="Service name" />
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (KES)" inputMode="numeric" type="number" min={0} aria-label="Price in KES" />
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60 min" inputMode="numeric" type="number" min={5} aria-label="Duration in minutes" />
          <Button onClick={create} disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Full editor (description, images, location type, cancellation policy) lives in the service detail editor — this quick-create keeps pricing honest.</p>
      </section>

      <div className="mt-5">
        {loading && <ListSkeleton rows={4} />}
        {error && !loading && <ErrorState description={error} onRetry={load} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="No services yet"
            description="Create your first service above — customers can only book what you list."
          />
        )}
        {!loading && !error && items.length > 0 && (
          <DataTable
            caption="Provider services"
            columns={[
              { key: 'name', header: 'Service', render: (s: Service) => <span className="font-medium">{s.name}</span> },
              { key: 'price', header: 'Price', render: (s: Service) => <span className="tabular-nums">{s.priceCents ?? s.price ?? '—'}</span> },
              { key: 'dur', header: 'Duration', render: (s: Service) => <span>{s.durationMin ?? '—'} min</span> },
              { key: 'status', header: 'Status', render: (s: Service) => <Badge variant={(s.isActive ?? s.status !== 'INACTIVE') ? 'success' : 'default'}>{(s.isActive ?? s.status !== 'INACTIVE') ? 'Active' : 'Inactive'}</Badge> },
              { key: 'act', header: 'Action', render: (s: Service) => <Button size="sm" variant="outline" onClick={() => toggle(s)}>Toggle</Button> },
            ]}
            rows={items}
            keyOf={(s) => s.id}
          />
        )}
      </div>
    </ProviderShell>
  );
}
