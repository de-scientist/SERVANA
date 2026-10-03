import * as React from 'react';
import { cn } from '@/lib/cn';

/** Admin/operational data table: search/filter/sort/pagination handled by caller. Mobile → cards. */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  caption,
  emptyLabel = 'No rows to show.',
  className,
}: {
  columns: { key: string; header: string; render: (row: T) => React.ReactNode; className?: string }[];
  rows: T[];
  keyOf: (row: T, i: number) => string;
  caption?: string;
  emptyLabel?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className={cn('overflow-x-auto rounded-lg border bg-card', className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={keyOf(row, i)} className="border-b last:border-0 hover:bg-muted/40">
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-top', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-2 text-sm">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="min-h-[40px] rounded-md border px-3 disabled:opacity-50"
      >
        Previous
      </button>
      <span aria-current="page" className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className="min-h-[40px] rounded-md border px-3 disabled:opacity-50"
      >
        Next
      </button>
    </nav>
  );
}
