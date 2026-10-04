'use client';

import * as React from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input } from './input';

export interface ComboboxOption {
  value: string;
  label: string;
}

/**
 * Lightweight filterable combobox (input + listbox, no dependency).
 * Arrow keys move the active option, Enter selects, Escape closes.
 */
export function Combobox({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = 'Type to search…',
  hint,
  error,
  className,
}: {
  id: string;
  label: string;
  options: readonly ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const listId = `${id}-listbox`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = options.find((o) => o.value === value);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="type-label">
        {label}
      </label>
      <div className="relative mt-1.5">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          value={open ? query : (selected?.label ?? query)}
          placeholder={selected?.label ?? placeholder}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, Math.max(filtered.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open && filtered[active]) {
              e.preventDefault();
              choose(filtered[active].value);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className={cn('pr-9', error && 'border-destructive')}
        />
        <ChevronsUpDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border bg-card p-1 shadow-elevated"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground" role="option" aria-selected="false">
                No matches.
              </li>
            )}
            {filtered.map((o, i) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o.value);
                  }}
                  className={cn(
                    'flex min-h-[40px] w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm',
                    i === active ? 'bg-muted' : '',
                  )}
                >
                  {o.label}
                  {o.value === value && <Check className="h-4 w-4 text-primary" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
