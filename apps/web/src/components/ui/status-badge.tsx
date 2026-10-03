import { Badge } from './badge';

/** Status badge — never uses colour alone: label text always carries meaning. */
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default' | 'primary'> = {
  CONFIRMED: 'success',
  PAID: 'success',
  SUCCESSFUL: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  VERIFIED: 'success',
  ACTIVE: 'success',
  PENDING: 'warning',
  AWAITING_PAYMENT: 'warning',
  PROCESSING: 'warning',
  IN_PROGRESS: 'info',
  PROVIDER_ACCEPTED: 'info',
  CANCELLED: 'default',
  EXPIRED: 'default',
  FAILED: 'danger',
  PROVIDER_REJECTED: 'danger',
  REVERSED: 'danger',
  REFUNDED: 'danger',
  DISPUTED: 'danger',
  NO_SHOW: 'danger',
  SUSPENDED: 'danger',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = STATUS_VARIANT[status] ?? 'default';
  return (
    <Badge variant={variant} className={className} aria-label={`Status: ${status.replace(/_/g, ' ').toLowerCase()}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
