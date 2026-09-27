'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Foundation: surface error boundary fallback for route-level errors.
  }, []);
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-2xl font-semibold">We hit a snag</h2>
      <p className="text-sm text-muted-foreground">An unexpected error occurred on this page.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
