'use client';

import * as React from 'react';
import { ToastProvider } from './toast';
import { ErrorBoundary } from './error-boundary';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>{children}</ToastProvider>
    </ErrorBoundary>
  );
}
