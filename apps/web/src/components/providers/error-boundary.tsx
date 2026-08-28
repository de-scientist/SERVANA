'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export function ErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const handler = (event: ErrorEvent) => setError(event.error);
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  if (error) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={() => setError(null)}>Try again</Button>
      </div>
    );
  }

  return <>{children}</>;
}
