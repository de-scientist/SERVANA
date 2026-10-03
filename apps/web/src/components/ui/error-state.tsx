'use client';

import { Button } from './button';

export function ErrorState({
  title = "We couldn't load this.",
  description = 'Your data is safe. Please try again.',
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center rounded-lg border border-destructive/30 bg-card px-6 py-10 text-center ${className ?? ''}`}
    >
      <h2 className="type-h4">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-5">
          Try again
        </Button>
      )}
    </div>
  );
}
