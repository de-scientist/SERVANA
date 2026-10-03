'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CategoryNode,
  fetchCategories,
  search,
  type SearchParams,
  type ServiceSearchHit,
  type ProviderSearchHit,
} from '@/lib/api';
import { ServiceCard } from '@/components/marketplace/service-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Sheet } from '@/components/ui/sheet';
import { Breadcrumb } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Rating } from '@/components/ui/rating';

export default function SearchPage() {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [filters, setFilters] = useState<SearchParams>({ pageSize: 30 });
  const [showFilters, setShowFilters] = useState(false);
  const [services, setServices] = useState<ServiceSearchHit[]>([]);
  const [providers, setProviders] = useState<ProviderSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      search(filters)
        .then((r) => {
          setServices(r.services);
          setProviders(r.providers);
        })
        .catch(() => setError('Search is temporarily unavailable.'))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  const flatCategories = useMemo(() => flatten(categories), [categories]);
  const set = (patch: Partial<SearchParams>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const activeFilterCount = [filters.categoryId, filters.city, filters.minPrice, filters.maxPrice, filters.verified, filters.travelToCustomer, filters.availableOn].filter(Boolean).length;

  const filterForm = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Category">
        <select
          value={filters.categoryId ?? ''}
          onChange={(e) => set({ categoryId: e.target.value || undefined })}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Category"
        >
          <option value="">All categories</option>
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label="City">
        <Input
          value={filters.city ?? ''}
          onChange={(e) => set({ city: e.target.value || undefined })}
          placeholder="e.g. Nairobi"
        />
      </Field>
      <Field label="Min price (KES)">
        <Input
          type="number" min={0} inputMode="numeric"
          value={filters.minPrice ?? ''}
          onChange={(e) => set({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
        />
      </Field>
      <Field label="Max price (KES)">
        <Input
          type="number" min={0} inputMode="numeric"
          value={filters.maxPrice ?? ''}
          onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
        />
      </Field>
      <Field label="Available on">
        <Input
          type="date"
          value={filters.availableOn ?? ''}
          onChange={(e) => set({ availableOn: e.target.value || undefined })}
        />
      </Field>
      <Field label="Sort by">
        <select
          value={filters.sort ?? 'relevance'}
          onChange={(e) => set({ sort: (e.target.value as SearchParams['sort']) ?? undefined })}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Sort by"
        >
          <option value="relevance">Relevance</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </Field>
      <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
        <Toggle label="Verified only" checked={!!filters.verified} onChange={(v) => set({ verified: v || undefined })} />
        <Toggle label="Travels to me" checked={!!filters.travelToCustomer} onChange={(v) => set({ travelToCustomer: v || undefined })} />
      </div>
      <div className="sm:col-span-2 lg:col-span-1 lg:self-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilters({ pageSize: 30 })}
          aria-label="Clear all filters"
        >
          Clear filters
        </Button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Search' }]} />
      <h1 className="type-h1 mt-3">Find beauty &amp; personal care</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        Try “Makeup artist near me”, “Barber tomorrow”, “Nails under KSh 2,000” or “Hair stylist in Nairobi”.
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="search-q" className="sr-only">Search services and providers</label>
        <Input
          id="search-q"
          type="search"
          value={filters.q ?? ''}
          onChange={(e) => set({ q: e.target.value || undefined })}
          placeholder="Search “bridal makeup”, “box braids”…"
          className="h-12 text-[15px]"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFilters(true)}
          className="h-12 shrink-0 sm:hidden"
          aria-haspopup="dialog"
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
      </div>

      <div className="mt-4 hidden sm:block">{filterForm}</div>
      <Sheet open={showFilters} onClose={() => setShowFilters(false)} title="Filters">
        {filterForm}
        <Button onClick={() => setShowFilters(false)} className="mt-4 w-full">
          Show results
        </Button>
      </Sheet>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Services {loading && <span className="normal-case text-primary">· loading…</span>}
        </h2>
        {error ? (
          <div className="mt-3"><ErrorState description="Search is temporarily unavailable. Your bookings are safe — please try again." onRetry={() => setFilters((f) => ({ ...f }))} /></div>
        ) : loading && services.length === 0 ? (
          <div className="mt-4"><CardGridSkeleton count={6} /></div>
        ) : services.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No services match your search yet"
              description="Try a broader term, remove a filter, or browse verified providers."
              actionLabel="Browse providers"
              actionHref="/providers"
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Providers</h2>
        {loading && providers.length === 0 ? (
          <div className="mt-4"><CardGridSkeleton count={3} /></div>
        ) : providers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No providers match your search yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((p) => (
              <Link
                key={p.id}
                href={`/providers/${p.slug}`}
                className="card-rest p-4 transition-micro hover:border-primary/50 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={p.businessName} src={p.avatarUrl} />
                  <div className="min-w-0">
                    <h3 className="truncate font-medium leading-tight">{p.businessName}</h3>
                    <p className="text-xs text-muted-foreground">{[p.city, p.country].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {p.categories.slice(0, 3).map((c) => (
                    <Badge key={c.id}>{c.name}</Badge>
                  ))}
                  {p.verified && <Badge variant="success">✓ Verified</Badge>}
                </div>
                <span className="sr-only">View provider</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        <Rating value={null} showCount={false} /> Ratings shown reflect verified platform reviews only.
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-primary"
      />
      {label}
    </label>
  );
}

function flatten(cats: CategoryNode[], depth = 0, acc: { id: string; label: string }[] = []): { id: string; label: string }[] {
  for (const c of cats) {
    acc.push({ id: c.id, label: `${'— '.repeat(depth)}${c.name}` });
    if (c.children?.length) flatten(c.children, depth + 1, acc);
  }
  return acc;
}
