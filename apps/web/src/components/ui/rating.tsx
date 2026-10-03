import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Rating display — always rendered from backend review aggregates. Never fabricated. */
export function Rating({
  value,
  count,
  className,
  showCount = true,
}: {
  value: number | null | undefined;
  count?: number | null;
  className?: string;
  showCount?: boolean;
}) {
  if (value == null || value <= 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-sm text-muted-foreground', className)}>
        <Star className="h-4 w-4" aria-hidden />
        <span>New</span>
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-sm font-medium', className)}
      role="img"
      aria-label={`Rated ${value.toFixed(1)} out of 5${count != null ? ` from ${count} reviews` : ''}`}
    >
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
      <span>{value.toFixed(1)}</span>
      {showCount && count != null && (
        <span className="font-normal text-muted-foreground">({count.toLocaleString()})</span>
      )}
    </span>
  );
}
