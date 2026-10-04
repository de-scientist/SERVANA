import * as React from 'react';
import { cn } from '@/lib/cn';

export { Breadcrumb } from './breadcrumb';

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label ?? 'Views'}
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'min-h-[40px] shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-micro',
            value === o.key
              ? 'bg-primary text-primary-foreground'
              : 'border bg-background hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
        )}
        <h2 className="type-h2 mt-1">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
