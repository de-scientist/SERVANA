import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Label + control + hint/error association helper.
 * Guarantees every custom field gets an accessible name and
 * error text linked via aria-describedby (WCAG 3.3.1).
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
  required,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (a11y: { id: string; describedBy?: string; invalid?: boolean }) => React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="type-label">
        {label}
        {required && (
          <span aria-hidden className="ml-1 text-destructive">
            *
          </span>
        )}
      </label>
      <div className="mt-1.5">
        {children({ id, describedBy, invalid: Boolean(error) })}
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

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
      'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      props['aria-invalid'] && 'border-destructive',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
