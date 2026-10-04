'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Input } from './input';

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date | null, b: Date) {
  return (
    a !== null &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toISODate(d: Date) {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Accessible month-grid calendar (single date). Days render as real
 * buttons with disabled + aria-disabled for past/unavailable dates,
 * aria-selected for the chosen day, and a table/grid role structure.
 * Unavailable dates are never selectable.
 */
export function Calendar({
  value,
  onChange,
  isUnavailable,
  label = 'Choose a date',
  className,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  isUnavailable?: (d: Date) => boolean;
  label?: string;
  className?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [cursor, setCursor] = React.useState(() => startOfMonth(value ?? new Date()));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className={className} role="group" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-semibold" aria-live="polite">
          {monthLabel}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div role="grid" aria-label={monthLabel} className="mt-2 grid grid-cols-7 gap-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <span key={d} role="columnheader" className="py-1 text-center text-xs font-medium text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />;
          const past = date < today;
          const closed = isUnavailable?.(date) ?? false;
          const disabled = past || closed;
          const selected = sameDay(value, date);
          return (
            <button
              key={toISODate(date)}
              type="button"
              role="gridcell"
              aria-selected={selected}
              aria-disabled={disabled || undefined}
              disabled={disabled}
              onClick={() => onChange(date)}
              aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${past ? ', past' : ''}${closed ? ', unavailable' : ''}${selected ? ', selected' : ''}`}
              className={cn(
                'min-h-[40px] rounded-md text-sm transition-micro',
                selected
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'border bg-background hover:bg-muted',
                disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * DatePicker: Calendar grid on desktop dialog state, native date input
 * as the mobile-friendly entry (large touch target, OS picker).
 */
export function DatePicker({
  id,
  label,
  value,
  onChange,
  min,
  max,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  min?: string;
  max?: string;
  hint?: string;
  error?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <label htmlFor={id} className="type-label">
        {label}
      </label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={cn('mt-1.5 h-11', error && 'border-destructive')}
      />
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

/** TimePicker: native time input with design-system sizing + error wiring. */
export function TimePicker({
  id,
  label,
  value,
  onChange,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (time: string) => void;
  hint?: string;
  error?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <label htmlFor={id} className="type-label">
        {label}
      </label>
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={cn('mt-1.5 h-11', error && 'border-destructive')}
      />
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
