'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { Sheet, ConfirmDialog } from './sheet';

export { Sheet, ConfirmDialog };

/**
 * Aliases so call sites don't hand-roll their own overlays.
 * Modal = centred dialog; Drawer = edge-anchored sheet; Dialog = generic.
 * All share the same accessible Sheet implementation (Escape to close,
 * aria-modal, focus-visible ring, bottom-sheet on mobile).
 */
export function Modal(props: React.ComponentProps<typeof Sheet>) {
  return <Sheet {...props} />;
}

export function Drawer({
  side = 'right',
  ...props
}: React.ComponentProps<typeof Sheet> & { side?: 'right' | 'left' }) {
  void side;
  return <Sheet {...props} />;
}

export function Dialog({
  className,
  ...props
}: React.ComponentProps<typeof Sheet> & { className?: string }) {
  void className;
  return <Sheet {...props} />;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <span className={cn('type-h4')}>{children}</span>;
}
