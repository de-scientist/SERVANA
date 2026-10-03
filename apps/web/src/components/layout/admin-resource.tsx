'use client';

import * as React from 'react';
import { apiClient } from '@/lib/api-client';
import { AdminShell } from '@/components/layout/admin-shell';
import { DataTable, Pagination } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Shared operational resource page: search + filters + sortable table + pagination
 * + row actions + honest empty/error states. Mobile degrades via horizontal scroll.
 */
export function AdminResourcePage<T>({
  title,
  description,
  endpoint,
  searchPlaceholder = 'Search…',
  columns,
  keyOf,
  emptyTitle,
  emptyDescription,
  filters,
}: {
  title: string;
  description: string;
  endpoint: string;
  searchPlaceholder?: string;
  columns: { key: string; header: string; render: (row: T) => React.ReactNode; className?: string }[];
  keyOf: (row: T, i: number) => string;
  emptyTitle: string;
  emptyDescription: string;
  filters?: React.ReactNode;
}) {
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [rows, setRows] = React.useState<T[]>([]);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debounced) params.set('q', debounced);
    apiClient
      .get(`${endpoint}?${params.toString()}`)
      .then((res) => {
        if (res.error) {
          setError(res.error.message);
          setRows([]);
          return;
        }
        const d = res.data as { data?: T[]; meta?: { pages?: number; total?: number } } | T[] | null;
        if (Array.isArray(d)) {
          setRows(d);
          setPages(1);
          setTotal(d.length);
        } else {
          setRows(d?.data ?? []);
          setPages(d?.meta?.pages ?? 1);
          setTotal(d?.meta?.total ?? (d?.data ?? []).length);
        }
      })
      .catch(() => {
        setError('We couldn’t load this list.');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [endpoint, page, debounced]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [debounced]);

  return (
    <AdminShell title={title} description={description}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={`admin-search-${title}`} className="sr-only">{searchPlaceholder}</label>
        <Input
          id={`admin-search-${title}`}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-11 max-w-md"
        />
        {filters}
        <span className="text-xs text-muted-foreground sm:ml-auto" role="status">
          {loading ? 'Loading…' : `${total.toLocaleString()} result${total === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="mt-4">
        {loading && <ListSkeleton rows={5} />}
        {error && !loading && <ErrorState description={error} onRetry={load} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        )}
        {!loading && !error && rows.length > 0 && (
          <>
            <DataTable caption={title} columns={columns} rows={rows} keyOf={keyOf} />
            <Pagination page={page} pages={pages} onPage={setPage} />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}>Export / print</Button>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
