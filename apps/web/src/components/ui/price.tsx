import { cn } from '@/lib/cn';
import { formatMinorUnits } from '@/lib/format';

/** Price display — renders backend amounts only. Supports minor-unit strings or major numbers. */
export function Price({
  minorUnits,
  major,
  currency = 'KES',
  className,
  prefix,
  strike,
}: {
  minorUnits?: number | string | null;
  major?: number | null;
  currency?: string;
  className?: string;
  prefix?: string;
  strike?: boolean;
}) {
  const label =
    minorUnits != null
      ? formatMinorUnits(minorUnits, currency)
      : major != null
        ? `${currency} ${major.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
        : `${currency} —`;
  return (
    <span className={cn('font-semibold tabular-nums', strike && 'font-normal text-muted-foreground line-through', className)}>
      {prefix ? `${prefix} ` : ''}
      {label}
    </span>
  );
}
