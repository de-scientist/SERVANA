'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CategoryNode,
  fetchCategories,
  formatPrice,
  search,
  SearchParams,
  ServiceSearchHit,
  ProviderSearchHit,
} from '@/lib/api';

export default function SearchPage() {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [filters, setFilters] = useState<SearchParams>({ pageSize: 30 });
  const [showFilters, setShowFilters] = useState(false);
  const [result, setResult] = useState<{
    services: ServiceSearchHit[];
    providers: ProviderSearchHit[];
  }>({ services: [], providers: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      search(filters)
        .then((r) => setResult({ services: r.services, providers: r.providers }))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  const flatCategories = useMemo(() => flatten(categories), [categories]);

  const set = (patch: Partial<SearchParams>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-bold tracking-tight">Find beauty &amp; personal care</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Search services, providers and categories across SERVANA.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={filters.q ?? ''}
          onChange={(e) => set({ q: e.target.value || undefined })}
          placeholder="Search “bridal makeup”, “box braids”…"
          className="h-11 w-full rounded-md border bg-card px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className="h-11 shrink-0 rounded-md border bg-card px-4 text-sm font-medium sm:hidden"
        >
          {showFilters ? 'Hide filters' : 'Filters'}
        </button>
      </div>

      <div className={`${showFilters ? 'block' : 'hidden'} mt-4 grid grid-cols-1 gap-3 sm:block sm:grid-cols-2 lg:grid-cols-4`}>
        <Field label="Category">
          <select
            value={filters.categoryId ?? ''}
            onChange={(e) => set({ categoryId: e.target.value || undefined })}
            className="h-10 w-full rounded-md border bg-card px-3 text-sm"
          >
            <option value="">All categories</option>
            {flatCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="City">
          <input
            value={filters.city ?? ''}
            onChange={(e) => set({ city: e.target.value || undefined })}
            placeholder="e.g. Nairobi"
            className="h-10 w-full rounded-md border bg-card px-3 text-sm"
          />
        </Field>
        <Field label="Min price (KES)">
          <input
            type="number"
            min={0}
            value={filters.minPrice ?? ''}
            onChange={(e) => set({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
            className="h-10 w-full rounded-md border bg-card px-3 text-sm"
          />
        </Field>
        <Field label="Max price (KES)">
          <input
            type="number"
            min={0}
            value={filters.maxPrice ?? ''}
            onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
            className="h-10 w-full rounded-md border bg-card px-3 text-sm"
          />
        </Field>
        <Field label="Available on">
          <input
            type="date"
            value={filters.availableOn ?? ''}
            onChange={(e) => set({ availableOn: e.target.value || undefined })}
            className="h-10 w-full rounded-md border bg-card px-3 text-sm"
          />
        </Field>
        <Field label="Sort by">
          <select
            value={filters.sort ?? 'relevance'}
            onChange={(e) => set({ sort: (e.target.value as SearchParams['sort']) ?? undefined })}
            className="h-10 w-full rounded-md border bg-card px-3 text-sm"
          >
            <option value="relevance">Relevance</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <Toggle label="Verified only" checked={!!filters.verified} onChange={(v) => set({ verified: v || undefined })} />
          <Toggle label="Travels to me" checked={!!filters.travelToCustomer} onChange={(v) => set({ travelToCustomer: v || undefined })} />
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Services {loading && <span className="text-primary">· loading…</span>}
        </h2>
        {result.services.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No services match your search yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.services.map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.id}`}
                className="rounded-lg border bg-card p-4 shadow-soft transition hover:border-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-tight">{s.name}</h3>
                  <span className="shrink-0 font-semibold">{formatPrice(s.priceCents, s.currency)}</span>
                </div>
                {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-2 py-0.5">{s.durationMin} min</span>
                  <span className="text-foreground/80">{s.provider.businessName ?? 'Provider'}</span>
                  {s.provider.city && <span>· {s.provider.city}</span>}
                  {s.provider.verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">verified</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Providers</h2>
        {result.providers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No providers match your search yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.providers.map((p) => (
              <Link
                key={p.id}
                href={`/providers/${p.slug}`}
                className="rounded-lg border bg-card p-4 shadow-soft transition hover:border-primary"
              >
                <div className="flex items-center gap-3">
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                      {(p.businessName ?? 'P').charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium leading-tight">{p.businessName}</h3>
                    <p className="text-xs text-muted-foreground">{[p.city, p.country].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  {p.categories.slice(0, 3).map((c) => (
                    <span key={c.id} className="rounded bg-muted px-2 py-0.5">{c.name}</span>
                  ))}
                  {p.verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">verified</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

function flatten(cats: CategoryNode[], depth = 0, acc: { id: string; label: string }[] = []): { id: string; label: string }[] {
  for (const c of cats) {
    acc.push({ id: c.id, label: `${'  '.repeat(depth)}${c.name}` });
    if (c.children?.length) flatten(c.children, depth + 1, acc);
  }
  return acc;
}
